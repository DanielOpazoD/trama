import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { resolveMultiuserSmokeEnv } from './multiuser-smoke-env.mjs'

const LEGACY_IDENTITY_SPEC = 'e2e/legacy-identity-cutover.spec.ts'

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

function runPlaywrightSpec({ spawnSyncImpl, env, args }) {
  return spawnSyncImpl(
    process.execPath,
    ['node_modules/.bin/playwright', 'test', ...args],
    {
      stdio: 'inherit',
      env,
    },
  )
}

function formatEvidence({ legacyOwnerChecked }) {
  return [
    '## Legacy identity smoke evidence',
    '',
    '```text',
    'legacy_identity_smoke: ok',
    'user_a_create_note: ok',
    'user_b_cannot_read_user_a_note: ok',
    `legacy_owner_read: ${legacyOwnerChecked ? 'ok' : 'skipped'}`,
    '```',
    '',
  ].join('\n')
}

export async function runLegacyIdentitySmoke({
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

  const result = runPlaywrightSpec({
    spawnSyncImpl,
    env: smokeEnv.env,
    args: [LEGACY_IDENTITY_SPEC, ...playwrightArgs],
  })

  try {
    await smokeEnv.cleanup()
  } catch (error) {
    write(stderr, 'legacy identity smoke: no se pudieron revocar sesiones temporales.')
    write(stderr, error instanceof Error ? error.message : String(error))
  }

  if (result.error) {
    write(stderr, String(result.error))
    return { exitCode: 1 }
  }

  if (result.status !== 0) {
    write(stderr, 'legacy_identity_smoke: failed')
    return { exitCode: result.status ?? 1 }
  }

  write(
    stdout,
    formatEvidence({ legacyOwnerChecked: Boolean(smokeEnv.env.E2E_LEGACY_OWNER_TOKEN) }),
  )
  return { exitCode: 0 }
}

async function main() {
  const result = await runLegacyIdentitySmoke()
  process.exit(result.exitCode)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
