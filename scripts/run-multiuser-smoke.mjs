import { spawnSync } from 'node:child_process'

const REQUIRED_ENV = ['E2E_BASE_URL', 'E2E_USER_A_TOKEN', 'E2E_USER_B_TOKEN']
const missing = REQUIRED_ENV.filter((key) => !process.env[key])

if (missing.length > 0) {
  console.error(
    `multi-user smoke no ejecutado: faltan ${missing.join(', ')}.\n` +
      'Configura E2E_BASE_URL, E2E_USER_A_TOKEN y E2E_USER_B_TOKEN para correr el smoke real.',
  )
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [
    'node_modules/.bin/playwright',
    'test',
    'e2e/multi-user-isolation.spec.ts',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', env: process.env },
)

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
