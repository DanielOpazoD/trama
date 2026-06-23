import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const DEFAULT_QUERY_IT_DB_URL =
  'postgresql://trama:trama_local_dev@localhost:5433/trama'

const QUERY_IT_TEST_ARGS = [
  'scripts/run-vitest.mjs',
  'run',
  'netlify/functions/_lib/query.integration.test.ts',
]

export function buildQueryIntegrationEnv(env = process.env) {
  const dbUrl =
    env.QUERY_IT_DB_URL ||
    env.DATABASE_URL ||
    env.NETLIFY_DB_URL ||
    DEFAULT_QUERY_IT_DB_URL

  return {
    ...env,
    QUERY_IT_DB_URL: dbUrl,
  }
}

function describeDbSource(env) {
  if (env.QUERY_IT_DB_URL) return 'QUERY_IT_DB_URL'
  if (env.DATABASE_URL) return 'DATABASE_URL'
  if (env.NETLIFY_DB_URL) return 'NETLIFY_DB_URL'
  return 'local default (npm run db:up)'
}

export function runQueryIntegrationLocal({
  env = process.env,
  spawnSyncImpl = spawnSync,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const childEnv = buildQueryIntegrationEnv(env)
  stdout(
    `Query integration DB: ${describeDbSource(env)} -> QUERY_IT_DB_URL=${childEnv.QUERY_IT_DB_URL}`,
  )
  if (!env.QUERY_IT_DB_URL && !env.DATABASE_URL && !env.NETLIFY_DB_URL) {
    stdout(
      'No explicit DB env was provided; using the local docker-compose database. Run `npm run db:up` first if it is not running.',
    )
  }

  const result = spawnSyncImpl(process.execPath, QUERY_IT_TEST_ARGS, {
    stdio: 'inherit',
    env: childEnv,
  })

  const status = typeof result.status === 'number' ? result.status : 1
  if (status !== 0) {
    stderr(
      'Query integration failed against a real Postgres URL. This wrapper intentionally does not allow the test to skip silently.',
    )
  }
  return status
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  process.exitCode = runQueryIntegrationLocal()
}
