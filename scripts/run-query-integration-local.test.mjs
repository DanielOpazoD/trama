import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_QUERY_IT_DB_URL,
  buildQueryIntegrationEnv,
  runQueryIntegrationLocal,
} from './run-query-integration-local.mjs'

describe('run-query-integration-local', () => {
  it('inyecta una DB local por defecto para evitar skips silenciosos', () => {
    const env = buildQueryIntegrationEnv({})

    expect(env.QUERY_IT_DB_URL).toBe(DEFAULT_QUERY_IT_DB_URL)
  })

  it('prefiere QUERY_IT_DB_URL explícito sobre otros defaults', () => {
    const env = buildQueryIntegrationEnv({
      QUERY_IT_DB_URL: 'postgresql://explicit/query',
      DATABASE_URL: 'postgresql://ignored/database',
      NETLIFY_DB_URL: 'postgresql://ignored/netlify',
    })

    expect(env.QUERY_IT_DB_URL).toBe('postgresql://explicit/query')
  })

  it('usa DATABASE_URL o NETLIFY_DB_URL cuando QUERY_IT_DB_URL no viene seteado', () => {
    expect(
      buildQueryIntegrationEnv({
        DATABASE_URL: 'postgresql://from/database',
      }).QUERY_IT_DB_URL,
    ).toBe('postgresql://from/database')

    expect(
      buildQueryIntegrationEnv({
        NETLIFY_DB_URL: 'postgresql://from/netlify',
      }).QUERY_IT_DB_URL,
    ).toBe('postgresql://from/netlify')
  })

  it('ejecuta el test de integración con QUERY_IT_DB_URL presente', () => {
    const spawnSyncImpl = vi.fn(() => ({ status: 0 }))
    const status = runQueryIntegrationLocal({
      env: {},
      spawnSyncImpl,
      stdout: vi.fn(),
      stderr: vi.fn(),
    })

    expect(status).toBe(0)
    expect(spawnSyncImpl).toHaveBeenCalledTimes(1)
    const [, args, options] = spawnSyncImpl.mock.calls[0]
    expect(args).toEqual([
      'scripts/run-vitest.mjs',
      'run',
      'netlify/functions/_lib/query.integration.test.ts',
    ])
    expect(options.env.QUERY_IT_DB_URL).toBe(DEFAULT_QUERY_IT_DB_URL)
  })
})
