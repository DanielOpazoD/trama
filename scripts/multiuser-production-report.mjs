#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { runCutoverPreflight } from './cutover-preflight.mjs'
import { resolveMultiuserSmokeEnv } from './multiuser-smoke-env.mjs'
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
    .replace(
      /\b((?:E2E|SMOKE)_(?:USER_[AB]_TOKEN|REVOKED_TOKEN)|CLERK_SECRET_KEY)=\S+/g,
      '$1=[redacted]',
    )
}

function getArgValue(argv, name) {
  const prefix = `--${name}=`
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

function isReportCliFlag(arg) {
  return (
    arg === '--json' ||
    arg === '--markdown' ||
    arg.startsWith('--comment-pr=') ||
    arg.startsWith('--repo=')
  )
}

function logSmokeEvent(report) {
  console.error(
    JSON.stringify({
      event: report.ok ? 'smoke.passed' : 'smoke.failed',
      category: 'operational',
      severity: report.ok ? 'info' : 'error',
      baseUrl: report.baseUrl,
      generatedAt: report.generatedAt,
      preflight: report.preflight.status,
      runtimeApiRouteProbe: report.routeProbe.ok ? 'ok' : 'failed',
      playwrightSmoke: report.playwright.ok ? 'ok' : 'failed',
      ts: new Date().toISOString(),
    }),
  )
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
  resolveSmokeEnv = resolveMultiuserSmokeEnv,
  spawnSyncImpl = spawnSync,
} = {}) {
  const baseUrl = env.E2E_BASE_URL
  if (!baseUrl) throw new Error('production smoke report requires E2E_BASE_URL.')

  const playwrightArgs = argv.filter((arg) => !isReportCliFlag(arg))
  if (
    !playwrightArgs.some((arg) => arg === '--project' || arg.startsWith('--project='))
  ) {
    playwrightArgs.push('--project=chromium')
  }
  const smokeEnv = await resolveSmokeEnv({ env })
  try {
    const tokenA = smokeEnv.env.E2E_USER_A_TOKEN
    const tokenB = smokeEnv.env.E2E_USER_B_TOKEN
    const preflight = await runPreflight({
      baseUrl,
      healthToken: tokenA,
    })
    const routeProbe = await probeRoutes({ baseUrl, tokenA, tokenB })
    const playwright = runPlaywrightSmoke({
      env: smokeEnv.env,
      spawnSyncImpl,
      playwrightArgs,
    })

    const report = {
      ok: preflight.status === 'ok' && routeProbe.ok && playwright.ok,
      baseUrl: normalizeBaseUrl(baseUrl),
      generatedAt: new Date().toISOString(),
      preflight,
      routeProbe,
      playwright,
    }
    logSmokeEvent(report)
    return report
  } finally {
    await smokeEnv.cleanup()
  }
}

export function commentProductionSmokeReport({
  report,
  prNumber,
  repo,
  spawnSyncImpl = spawnSync,
} = {}) {
  if (!prNumber) throw new Error('commentProductionSmokeReport requires prNumber')
  const markdown = formatProductionSmokeMarkdown(report)
  const args = ['pr', 'comment', String(prNumber)]
  if (repo) args.push('--repo', repo)
  args.push('--body-file', '-')
  const result = spawnSyncImpl('gh', args, {
    input: markdown,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return {
    ok: !result.error && result.status === 0,
    status: result.status ?? 1,
    stdout: redactText(result.stdout),
    stderr: redactText(result.stderr ?? result.error?.message ?? ''),
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
    const argv = process.argv.slice(2)
    const report = await runProductionSmokeReport()
    if (process.argv.includes('--json')) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    } else {
      process.stdout.write(formatProductionSmokeMarkdown(report))
    }
    const commentPr = getArgValue(argv, 'comment-pr')
    if (commentPr) {
      const comment = commentProductionSmokeReport({
        report,
        prNumber: commentPr,
        repo: getArgValue(argv, 'repo') ?? process.env.GITHUB_REPOSITORY,
      })
      if (!comment.ok) {
        process.stderr.write(comment.stderr || 'production smoke PR comment failed\n')
        process.exit(1)
      }
    }
    process.exit(report.ok ? 0 : 1)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
