import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_BACKEND_DATA_IT_DB_URL,
  buildBackendDataIntegrationEnv,
  runBackendDataIntegrationLocal,
  sanitizeDbUrlForLog,
} from './run-backend-data-integration-local.mjs'

describe('run-backend-data-integration-local', () => {
  it('inyecta una DB local por defecto para evitar skips silenciosos', () => {
    const env = buildBackendDataIntegrationEnv({})

    expect(env.BACKEND_DATA_IT_DB_URL).toBe(DEFAULT_BACKEND_DATA_IT_DB_URL)
  })

  it('prefiere BACKEND_DATA_IT_DB_URL explícito sobre otros defaults', () => {
    const env = buildBackendDataIntegrationEnv({
      BACKEND_DATA_IT_DB_URL: 'postgresql://explicit/backend',
      LOCAL_DB_CONFIDENCE_ADMIN_DB_URL: 'postgresql://ignored/admin',
      QUERY_IT_DB_URL: 'postgresql://ignored/query',
      DATABASE_URL: 'postgresql://ignored/database',
      NETLIFY_DB_URL: 'postgresql://ignored/netlify',
    })

    expect(env.BACKEND_DATA_IT_DB_URL).toBe('postgresql://explicit/backend')
  })

  it('usa la URL admin compartida o QUERY_IT_DB_URL antes de URLs runtime', () => {
    expect(
      buildBackendDataIntegrationEnv({
        LOCAL_DB_CONFIDENCE_ADMIN_DB_URL: 'postgresql://from/admin',
        QUERY_IT_DB_URL: 'postgresql://from/query',
      }).BACKEND_DATA_IT_DB_URL,
    ).toBe('postgresql://from/admin')

    expect(
      buildBackendDataIntegrationEnv({
        QUERY_IT_DB_URL: 'postgresql://from/query',
      }).BACKEND_DATA_IT_DB_URL,
    ).toBe('postgresql://from/query')
  })

  it('usa DATABASE_URL o NETLIFY_DB_URL cuando no hay URL de integración', () => {
    expect(
      buildBackendDataIntegrationEnv({
        DATABASE_URL: 'postgresql://from/database',
      }).BACKEND_DATA_IT_DB_URL,
    ).toBe('postgresql://from/database')

    expect(
      buildBackendDataIntegrationEnv({
        NETLIFY_DB_URL: 'postgresql://from/netlify',
      }).BACKEND_DATA_IT_DB_URL,
    ).toBe('postgresql://from/netlify')
  })

  it('no imprime credenciales de la URL de Postgres', () => {
    expect(sanitizeDbUrlForLog('postgresql://user:secret@localhost:5433/trama')).toBe(
      'postgresql://localhost:5433/trama',
    )
  })

  it('ejecuta el test de integración con BACKEND_DATA_IT_DB_URL presente', () => {
    const spawnSyncImpl = vi.fn(() => ({ status: 0 }))
    const stdout = vi.fn()
    const status = runBackendDataIntegrationLocal({
      env: {},
      spawnSyncImpl,
      stdout,
      stderr: vi.fn(),
    })

    expect(status).toBe(0)
    expect(spawnSyncImpl).toHaveBeenCalledTimes(1)
    const [, args, options] = spawnSyncImpl.mock.calls[0]
    expect(args).toEqual([
      'scripts/run-vitest.mjs',
      'run',
      'netlify/functions/_lib/backend-data-contracts.integration.test.ts',
    ])
    expect(options.env.BACKEND_DATA_IT_DB_URL).toBe(DEFAULT_BACKEND_DATA_IT_DB_URL)
    expect(stdout.mock.calls[0][0]).not.toContain('trama_local_dev')
  })
})
