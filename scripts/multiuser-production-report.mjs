#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { runCutoverPreflight } from './cutover-preflight.mjs'
import { probeRuntimeApiRoutes } from './runtime-api-routes.mjs'

const PLAYWRIGHT_SPECS = [
  'e2e/runtime-api-routing.spec.ts',
  'e2e/multi-user-isolation.spec.ts',
]

function normalizeBaseUrl(baseUrl) {
  return baseUrl?.replace(/\/$/, '')
}

function redactText(value) {
  return String(value ?? '')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted]')
    .replace(/\bsk_(?:live|test|proj)_[A-Za-z0-9._-]+\b/g, '[redacted]')
}

function runPlaywrightSmoke({ env, spawnSyncImpl, playwrightArgs }) {
  const result = spawnSyncImpl(
    process.execPath,
    ['node_modules/.bin/playwright', 'test', ...PLAYWRIGHT_SPECS, ...playwrightArgs],
    {
      stdio: 'pipe',
      encoding: 'utf8',
      env,
    },
  )

  return {
    ok: !result.error && result.status === 0,
    status: result.status ?? 1,
    stdout: redactText(result.stdout),
    stderr: redactText(result.stderr ?? result.error?.message ?? ''),
  }
}

export async function runProductionSmokeReport({
  env = process.env,
  argv = process.argv.slice(2),
  runPreflight = runCutoverPreflight,
  probeRuntimeApiRoutes: probeRoutes = probeRuntimeApiRoutes,
  spawnSyncImpl = spawnSync,
} = {}) {
  const baseUrl = env.E2E_BASE_URL
  const tokenA = env.E2E_USER_A_TOKEN
  const tokenB = env.E2E_USER_B_TOKEN
  if (!baseUrl || !tokenA) {
    throw new Error(
      'production smoke report requires E2E_BASE_URL and E2E_USER_A_TOKEN. E2E_USER_B_TOKEN is recommended.',
    )
  }

  const playwrightArgs = argv.filter((arg) => arg !== '--json' && arg !== '--markdown')
  if (
    !playwrightArgs.some((arg) => arg === '--project' || arg.startsWith('--project='))
  ) {
    playwrightArgs.push('--project=chromium')
  }
  const preflight = await runPreflight({
    baseUrl,
    healthToken: tokenA,
  })
  const routeProbe = await probeRoutes({ baseUrl, tokenA, tokenB })
  const playwright = runPlaywrightSmoke({
    env,
    spawnSyncImpl,
    playwrightArgs,
  })

  return {
    ok: preflight.status === 'ok' && routeProbe.ok && playwright.ok,
    baseUrl: normalizeBaseUrl(baseUrl),
    generatedAt: new Date().toISOString(),
    preflight,
    routeProbe,
    playwright,
  }
}

export function formatProductionSmokeMarkdown(report) {
  const lines = [
    '## Multiuser production smoke evidence',
    '',
    '```text',
    `production_smoke: ${report.ok ? 'ok' : 'failed'}`,
    `base_url: ${report.baseUrl}`,
    `generated_at: ${report.generatedAt}`,
    '',
    '# preflight',
    ...report.preflight.lines,
    '',
    '# runtime API routes',
    `runtime_api_route_probe: ${report.routeProbe.ok ? 'ok' : 'failed'}`,
    ...report.routeProbe.results.map(
      (item) =>
        `${item.ok ? 'ok' : 'fail'} ${item.method} ${item.path} -> ${item.status}`,
    ),
    '',
    '# playwright',
    `playwright_smoke: ${report.playwright.ok ? 'ok' : 'failed'}`,
    `playwright_status: ${report.playwright.status}`,
    '```',
  ]

  if (report.preflight.hints?.length) {
    lines.push('', 'Hints:', ...report.preflight.hints.map((hint) => `- ${hint}`))
  }

  if (report.routeProbe.failures?.length) {
    lines.push(
      '',
      'Route failures:',
      ...report.routeProbe.failures.map(
        (failure) => `- ${failure.path}: ${failure.reason ?? 'failed'}`,
      ),
    )
  }

  if (!report.playwright.ok && (report.playwright.stderr || report.playwright.stdout)) {
    lines.push(
      '',
      'Playwright output:',
      '```text',
      redactText(report.playwright.stderr || report.playwright.stdout).slice(0, 3000),
      '```',
    )
  }

  return `${lines.join('\n')}\n`
}

async function main() {
  try {
    const report = await runProductionSmokeReport()
    if (process.argv.includes('--json')) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    } else {
      process.stdout.write(formatProductionSmokeMarkdown(report))
    }
    process.exit(report.ok ? 0 : 1)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
