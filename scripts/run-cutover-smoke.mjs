import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { formatPreflightMarkdown, runCutoverPreflight } from './cutover-preflight.mjs'
import { resolveMultiuserSmokeEnv } from './multiuser-smoke-env.mjs'

function splitRunnerArgs(argv, env) {
  const playwrightArgs = []
  let baseUrl = env.E2E_BASE_URL
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--base-url') {
      baseUrl = argv[index + 1]
      index += 1
    } else if (arg.startsWith('--base-url=')) {
      baseUrl = arg.slice('--base-url='.length)
    } else {
      playwrightArgs.push(arg)
    }
  }
  return { baseUrl, playwrightArgs }
}

function write(stream, text) {
  stream.write(`${text}${text.endsWith('\n') ? '' : '\n'}`)
}

function formatCutoverSmokeEvidence({ preflight, revokedTokenPresent }) {
  return [
    '## Cutover smoke evidence',
    '',
    '```text',
    'cutover_smoke: ok',
    ...preflight.lines,
    `revoked_401: ${revokedTokenPresent ? 'ok' : 'skipped'}`,
    'read_isolation: ok',
    'mutation_isolation: ok',
    'blob_isolation: ok',
    '```',
    '',
  ].join('\n')
}

export async function runCutoverSmoke({
  env = process.env,
  argv = process.argv.slice(2),
  runPreflight = runCutoverPreflight,
  resolveSmokeEnv = resolveMultiuserSmokeEnv,
  spawnSyncImpl = spawnSync,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const { baseUrl, playwrightArgs } = splitRunnerArgs(argv, env)
  let smokeEnv
  try {
    smokeEnv = await resolveSmokeEnv({
      env: { ...env, E2E_BASE_URL: baseUrl },
    })
  } catch (error) {
    write(stderr, error instanceof Error ? error.message : String(error))
    return { exitCode: 1 }
  }

  if (smokeEnv.mode === 'minted-clerk-tokens') {
    write(stdout, 'cutover smoke: usando tokens efimeros generados con Clerk.')
  }

  const preflight = await runPreflight({
    baseUrl,
    healthToken: smokeEnv.env.E2E_USER_A_TOKEN,
  })
  write(stdout, formatPreflightMarkdown(preflight))

  if (preflight.status !== 'ok') {
    try {
      await smokeEnv.cleanup()
    } catch (error) {
      write(
        stderr,
        'cutover smoke: no se pudieron revocar todas las sesiones temporales.',
      )
      write(stderr, error instanceof Error ? error.message : String(error))
    }
    write(stderr, 'cutover smoke detenido: preflight estricto no pasó.')
    return { exitCode: 1 }
  }

  const result = spawnSyncImpl(
    process.execPath,
    [
      'node_modules/.bin/playwright',
      'test',
      'e2e/multi-user-isolation.spec.ts',
      ...playwrightArgs,
    ],
    { stdio: 'inherit', env: smokeEnv.env },
  )

  try {
    await smokeEnv.cleanup()
  } catch (error) {
    write(stderr, 'cutover smoke: no se pudieron revocar todas las sesiones temporales.')
    write(stderr, error instanceof Error ? error.message : String(error))
  }

  if (result.error) {
    write(stderr, String(result.error))
    return { exitCode: 1 }
  }

  if (result.status !== 0) {
    write(stderr, 'cutover_smoke: failed')
    return { exitCode: result.status ?? 1 }
  }

  write(
    stdout,
    formatCutoverSmokeEvidence({
      preflight,
      revokedTokenPresent: Boolean(smokeEnv.env.E2E_REVOKED_TOKEN),
    }),
  )
  return { exitCode: 0 }
}

async function main() {
  const result = await runCutoverSmoke()
  process.exit(result.exitCode)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
