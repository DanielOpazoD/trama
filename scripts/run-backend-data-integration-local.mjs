import { spawnSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

export const DEFAULT_BACKEND_DATA_IT_DB_URL =
  'postgresql://trama:trama_local_dev@localhost:5433/trama'

const BACKEND_DATA_IT_TEST_ARGS = [
  'scripts/run-vitest.mjs',
  'run',
  'netlify/functions/_lib/backend-data-contracts.integration.test.ts',
]

export function buildBackendDataIntegrationEnv(env = process.env) {
  const dbUrl =
    env.BACKEND_DATA_IT_DB_URL ||
    env.LOCAL_DB_CONFIDENCE_ADMIN_DB_URL ||
    env.QUERY_IT_DB_URL ||
    env.DATABASE_URL ||
    env.NETLIFY_DB_URL ||
    DEFAULT_BACKEND_DATA_IT_DB_URL

  return {
    ...env,
    BACKEND_DATA_IT_DB_URL: dbUrl,
  }
}

export function sanitizeDbUrlForLog(dbUrl) {
  try {
    const parsed = new URL(dbUrl)
    parsed.username = ''
    parsed.password = ''
    return parsed.toString()
  } catch {
    return '[unparseable database URL]'
  }
}

function describeDbSource(env) {
  if (env.BACKEND_DATA_IT_DB_URL) return 'BACKEND_DATA_IT_DB_URL'
  if (env.LOCAL_DB_CONFIDENCE_ADMIN_DB_URL) return 'LOCAL_DB_CONFIDENCE_ADMIN_DB_URL'
  if (env.QUERY_IT_DB_URL) return 'QUERY_IT_DB_URL'
  if (env.DATABASE_URL) return 'DATABASE_URL'
  if (env.NETLIFY_DB_URL) return 'NETLIFY_DB_URL'
  return 'local default (npm run db:up)'
}

export function runBackendDataIntegrationLocal({
  env = process.env,
  spawnSyncImpl = spawnSync,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const childEnv = buildBackendDataIntegrationEnv(env)
  stdout(
    `Backend data integration DB: ${describeDbSource(env)} -> BACKEND_DATA_IT_DB_URL=${sanitizeDbUrlForLog(childEnv.BACKEND_DATA_IT_DB_URL)}`,
  )
  if (
    !env.BACKEND_DATA_IT_DB_URL &&
    !env.LOCAL_DB_CONFIDENCE_ADMIN_DB_URL &&
    !env.QUERY_IT_DB_URL &&
    !env.DATABASE_URL &&
    !env.NETLIFY_DB_URL
  ) {
    stdout(
      'No explicit DB env was provided; using the local docker-compose database. Run `npm run db:up` first if it is not running.',
    )
  }

  const result = spawnSyncImpl(process.execPath, BACKEND_DATA_IT_TEST_ARGS, {
    stdio: 'inherit',
    env: childEnv,
  })

  const status = typeof result.status === 'number' ? result.status : 1
  if (status !== 0) {
    stderr(
      'Backend data integration failed against a real Postgres URL. This wrapper intentionally does not allow the test to skip silently.',
    )
  }
  return status
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  process.exitCode = runBackendDataIntegrationLocal()
}
