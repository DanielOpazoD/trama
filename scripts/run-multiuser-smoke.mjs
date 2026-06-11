import { spawnSync } from 'node:child_process'

import { resolveMultiuserSmokeEnv } from './multiuser-smoke-env.mjs'

let smokeEnv

try {
  smokeEnv = await resolveMultiuserSmokeEnv()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

if (smokeEnv.mode === 'minted-clerk-tokens') {
  console.info('multi-user smoke: usando tokens efimeros generados con Clerk.')
}

const result = spawnSync(
  process.execPath,
  [
    'node_modules/.bin/playwright',
    'test',
    'e2e/multi-user-isolation.spec.ts',
    'e2e/momentos-shared-space.spec.ts',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', env: smokeEnv.env },
)

try {
  await smokeEnv.cleanup()
} catch (error) {
  console.warn('multi-user smoke: no se pudieron revocar todas las sesiones temporales.')
  console.warn(error instanceof Error ? error.message : error)
}

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
