import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { resolveMultiuserSmokeEnv } from './multiuser-smoke-env.mjs'

const ISOLATION_GREP = 'user B cannot discover user A fixtures'

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

function formatEvidence() {
  return [
    '## Cutover isolation smoke evidence',
    '',
    '```text',
    'cutover_isolation_smoke: ok',
    'anonymous_401: not_checked_preview_only',
    'revoked_401: not_checked_preview_only',
    'read_isolation: ok',
    'mutation_isolation: ok',
    'blob_isolation: ok',
    '```',
    '',
    'Este comando valida aislamiento A/B en previews con fallback legacy; no reemplaza cutover:smoke para producción estricta.',
    '',
  ].join('\n')
}

export async function runCutoverIsolationSmoke({
  env = process.env,
  argv = process.argv.slice(2),
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
    write(stdout, 'cutover isolation smoke: usando tokens efimeros generados con Clerk.')
  } else if (smokeEnv.mode === 'active-clerk-sessions') {
    write(stdout, 'cutover isolation smoke: usando sesiones activas existentes de Clerk.')
  }

  const result = spawnSyncImpl(
    process.execPath,
    [
      'node_modules/.bin/playwright',
      'test',
      'e2e/multi-user-isolation.spec.ts',
      '--grep',
      ISOLATION_GREP,
      ...playwrightArgs,
    ],
    { stdio: 'inherit', env: smokeEnv.env },
  )

  try {
    await smokeEnv.cleanup()
  } catch (error) {
    write(
      stderr,
      'cutover isolation smoke: no se pudieron revocar todas las sesiones temporales.',
    )
    write(stderr, error instanceof Error ? error.message : String(error))
  }

  if (result.error) {
    write(stderr, String(result.error))
    return { exitCode: 1 }
  }

  if (result.status !== 0) {
    write(stderr, 'cutover_isolation_smoke: failed')
    return { exitCode: result.status ?? 1 }
  }

  write(stdout, formatEvidence())
  return { exitCode: 0 }
}

async function main() {
  const result = await runCutoverIsolationSmoke()
  process.exit(result.exitCode)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
