import { pathToFileURL } from 'node:url'

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) {
    throw new Error('cutover preflight requiere --base-url=<url> o E2E_BASE_URL=<url>.')
  }
  return baseUrl.replace(/\/$/, '')
}

function parseArgs(argv, env = process.env) {
  const options = {
    baseUrl: env.E2E_BASE_URL,
    healthToken: env.CUTOVER_HEALTH_TOKEN ?? env.E2E_USER_A_TOKEN,
    allowLegacyPreview: false,
    markdown: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--allow-legacy-preview') {
      options.allowLegacyPreview = true
    } else if (arg === '--markdown') {
      options.markdown = true
    } else if (arg === '--base-url') {
      options.baseUrl = argv[index + 1]
      index += 1
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length)
    } else if (arg === '--health-token') {
      options.healthToken = argv[index + 1]
      index += 1
    } else if (arg.startsWith('--health-token=')) {
      options.healthToken = arg.slice('--health-token='.length)
    }
  }
  return options
}

async function fetchJson(fetchImpl, url, token) {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  })
  let json
  try {
    json = await response.json()
  } catch {
    json = null
  }
  return { status: response.status, json }
}

function buildResult({ status, lines, hints = [] }) {
  return {
    status,
    exitCode: status === 'failed' ? 1 : 0,
    lines,
    hints,
  }
}

export async function runCutoverPreflight({
  baseUrl,
  allowLegacyPreview = false,
  fetchImpl = fetch,
  healthToken,
} = {}) {
  let normalizedBaseUrl
  try {
    normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  } catch (error) {
    return buildResult({
      status: 'failed',
      lines: ['cutover_preflight: failed', 'base_url: missing'],
      hints: [error instanceof Error ? error.message : String(error)],
    })
  }

  const hints = []
  let health
  try {
    health = await fetchJson(fetchImpl, `${normalizedBaseUrl}/api/health`, healthToken)
  } catch (error) {
    return buildResult({
      status: 'failed',
      lines: ['cutover_preflight: failed', 'health: failed_fetch'],
      hints: [error instanceof Error ? error.message : String(error)],
    })
  }

  let anonymousStatus
  try {
    const anonymous = await fetchImpl(`${normalizedBaseUrl}/api/entities`, {
      headers: {},
    })
    anonymousStatus =
      anonymous.status === 401 ? 'ok' : `failed_status_${anonymous.status}`
  } catch (error) {
    anonymousStatus = 'failed_fetch'
    hints.push(error instanceof Error ? error.message : String(error))
  }

  const auth = health.json?.auth
  if (health.status === 401 && anonymousStatus === 'ok') {
    return buildResult({
      status: 'partial_health_auth_required',
      lines: [
        'cutover_preflight: partial_health_auth_required',
        'health: skipped_auth_required',
        'anonymous_401: ok',
      ],
      hints: [
        'Para verificar auth.mode sin abrir secrets, entrega CUTOVER_HEALTH_TOKEN o E2E_USER_A_TOKEN.',
      ],
    })
  }

  if (health.status !== 200 || !auth) {
    return buildResult({
      status: 'failed',
      lines: [
        'cutover_preflight: failed',
        `health: failed_status_${health.status}`,
        'auth_clerk: failed_missing_auth',
        `anonymous_401: ${anonymousStatus}`,
      ],
      hints: ['El endpoint /api/health debe exponer auth.mode sin filtrar secretos.'],
    })
  }

  const lines = ['health: ok']
  if (auth.clerkConfigured !== true) {
    return buildResult({
      status: 'failed',
      lines: ['cutover_preflight: failed', ...lines, 'auth_clerk: failed_not_configured'],
      hints: ['Configura CLERK_SECRET_KEY y VITE_CLERK_PUBLISHABLE_KEY juntas.'],
    })
  }

  lines.push('auth_clerk: ok')
  const legacyFallback =
    auth.legacyFallbackAllowed === true || auth.mode === 'clerk-with-legacy-fallback'

  if (legacyFallback && allowLegacyPreview) {
    return buildResult({
      status: 'preview_fallback',
      lines: [
        'cutover_preflight: skipped_preview_fallback',
        ...lines,
        'auth_strict: skipped_preview_fallback',
        'anonymous_401: skipped_preview_fallback',
      ],
      hints: [
        'Deploy preview puede correr con fallback legacy, pero eso no demuestra cutover.',
      ],
    })
  }

  if (legacyFallback) {
    return buildResult({
      status: 'failed',
      lines: [
        'cutover_preflight: failed',
        ...lines,
        'auth_strict: failed_legacy_fallback',
        `anonymous_401: ${anonymousStatus}`,
      ],
      hints: ['Desactiva ALLOW_LEGACY_FALLBACK antes de declarar cutover multiusuario.'],
    })
  }

  if (anonymousStatus !== 'ok') {
    return buildResult({
      status: 'failed',
      lines: [
        'cutover_preflight: failed',
        ...lines,
        'auth_strict: ok',
        `anonymous_401: ${anonymousStatus}`,
      ],
      hints: ['Producción estricta exige anónimo = 401 en /api/entities.'],
    })
  }

  return buildResult({
    status: 'ok',
    lines: ['cutover_preflight: ok', ...lines, 'auth_strict: ok', 'anonymous_401: ok'],
    hints,
  })
}

export function formatPreflightMarkdown(result) {
  const hints =
    result.hints.length > 0
      ? `\n\nHints:\n${result.hints.map((hint) => `- ${hint}`).join('\n')}`
      : ''
  return `## Cutover preflight\n\n\`\`\`text\n${result.lines.join('\n')}\n\`\`\`${hints}\n`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const result = await runCutoverPreflight(options)
  if (options.markdown) {
    console.log(formatPreflightMarkdown(result))
  } else {
    console.log(result.lines.join('\n'))
    if (result.hints.length > 0) console.error(result.hints.join('\n'))
  }
  process.exit(result.exitCode)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
