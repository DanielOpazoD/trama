#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

export const DEFAULT_LOCAL_DB_URL =
  'postgresql://trama:trama_local_dev@localhost:5433/trama'

export const DB_CONFIDENCE_STEPS = [
  {
    label: 'CTE regression',
    command: ['npm', 'run', 'check:cte-regression'],
    usesMigratedDb: false,
    summary: 'CTEs atómicos contra Postgres efímero o DATABASE_URL explícito.',
  },
  {
    label: 'Query plans',
    command: ['npm', 'run', 'check:query-plans'],
    usesMigratedDb: true,
    summary: 'EXPLAIN JSON de listados calientes contra DB migrada.',
  },
  {
    label: 'Query integration',
    command: ['npm', 'run', 'test:query-it:local'],
    usesMigratedDb: true,
    summary: 'Motor de queries contra Postgres real, sin skips silenciosos.',
  },
  {
    label: 'Backend data integration',
    command: ['npm', 'run', 'test:backend-data-it'],
    usesMigratedDb: true,
    summary: 'Endpoints críticos contra Postgres real y RLS simulado.',
  },
  {
    label: 'User id write contracts',
    command: ['npm', 'run', 'check:user-id-writes'],
    usesMigratedDb: false,
    summary: 'INSERTs privados escriben user_id explícito o warning aceptado.',
  },
]

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

function resolveDbUrl(env) {
  return (
    env.QUERY_IT_DB_URL || env.DATABASE_URL || env.NETLIFY_DB_URL || DEFAULT_LOCAL_DB_URL
  )
}

function resolveIntegrationDbUrl(env, dbUrl) {
  return env.LOCAL_DB_CONFIDENCE_ADMIN_DB_URL || env.QUERY_IT_DB_URL || dbUrl
}

export function buildDbConfidenceEnv(env = process.env) {
  const dbUrl = resolveDbUrl(env)
  const integrationDbUrl = resolveIntegrationDbUrl(env, dbUrl)
  return {
    ...env,
    NETLIFY_DB_URL: env.NETLIFY_DB_URL || dbUrl,
    QUERY_IT_DB_URL: env.QUERY_IT_DB_URL || integrationDbUrl,
    BACKEND_DATA_IT_DB_URL:
      env.BACKEND_DATA_IT_DB_URL || env.QUERY_IT_DB_URL || integrationDbUrl,
  }
}

function envForStep(step, childEnv) {
  if (step.command.join(' ') !== 'npm run check:cte-regression') return childEnv
  if (childEnv.LOCAL_DB_CONFIDENCE_CTE_DATABASE_URL) {
    return {
      ...childEnv,
      DATABASE_URL: childEnv.LOCAL_DB_CONFIDENCE_CTE_DATABASE_URL,
    }
  }
  const cteEnv = { ...childEnv }
  delete cteEnv.DATABASE_URL
  delete cteEnv.NETLIFY_DB_URL
  delete cteEnv.QUERY_IT_DB_URL
  delete cteEnv.BACKEND_DATA_IT_DB_URL
  return cteEnv
}

export function runLocalDbConfidence({
  env = process.env,
  spawnSyncImpl = spawnSync,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const childEnv = buildDbConfidenceEnv(env)
  stdout('Local DB confidence pack')
  stdout(`DB migrada: ${sanitizeDbUrlForLog(resolveDbUrl(childEnv))}`)
  if (env.LOCAL_DB_CONFIDENCE_ADMIN_DB_URL) {
    stdout(
      `DB admin para integraciones: ${sanitizeDbUrlForLog(env.LOCAL_DB_CONFIDENCE_ADMIN_DB_URL)}`,
    )
  }
  stdout('Si usas el default local, corre `npm run db:up` antes de este paquete.')
  stdout(
    'CTE regression usa Postgres efímero por defecto; define LOCAL_DB_CONFIDENCE_CTE_DATABASE_URL sólo para una DB throwaway.',
  )

  for (const step of DB_CONFIDENCE_STEPS) {
    stdout(`\n▶ ${step.label}: ${step.summary}`)
    const [bin, ...args] = step.command
    const result = spawnSyncImpl(bin, args, {
      stdio: 'inherit',
      env: envForStep(step, childEnv),
    })
    const status = typeof result.status === 'number' ? result.status : 1
    if (status !== 0) {
      stderr(`Local DB confidence failed at ${step.command.join(' ')}.`)
      return status
    }
  }

  stdout('\nLocal DB confidence OK.')
  return 0
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) process.exitCode = runLocalDbConfidence()
