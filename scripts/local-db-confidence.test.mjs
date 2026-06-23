import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LOCAL_DB_URL,
  DB_CONFIDENCE_STEPS,
  buildDbConfidenceEnv,
  runLocalDbConfidence,
  sanitizeDbUrlForLog,
} from './local-db-confidence.mjs'

describe('local-db-confidence', () => {
  it('declara el paquete de gates DB reales en orden operacional', () => {
    expect(DB_CONFIDENCE_STEPS.map((step) => step.command)).toEqual([
      ['npm', 'run', 'check:cte-regression'],
      ['npm', 'run', 'check:query-plans'],
      ['npm', 'run', 'test:query-it:local'],
      ['npm', 'run', 'test:backend-data-it'],
      ['npm', 'run', 'check:user-id-writes'],
    ])
  })

  it('inyecta DB local migrada por defecto para gates que necesitan Postgres', () => {
    const env = buildDbConfidenceEnv({})

    expect(env.QUERY_IT_DB_URL).toBe(DEFAULT_LOCAL_DB_URL)
    expect(env.BACKEND_DATA_IT_DB_URL).toBe(DEFAULT_LOCAL_DB_URL)
    expect(env.NETLIFY_DB_URL).toBe(DEFAULT_LOCAL_DB_URL)
  })

  it('prefiere URLs explícitas y no imprime credenciales', () => {
    const env = buildDbConfidenceEnv({
      DATABASE_URL: 'postgresql://from:secret@localhost:5444/custom',
    })

    expect(env.QUERY_IT_DB_URL).toBe('postgresql://from:secret@localhost:5444/custom')
    expect(env.BACKEND_DATA_IT_DB_URL).toBe(
      'postgresql://from:secret@localhost:5444/custom',
    )
    expect(sanitizeDbUrlForLog(env.QUERY_IT_DB_URL)).toBe(
      'postgresql://localhost:5444/custom',
    )
  })

  it('acepta una URL admin separada para tests que crean roles RLS', () => {
    const env = buildDbConfidenceEnv({
      NETLIFY_DB_URL: 'postgresql://app:secret@localhost:5433/trama',
      LOCAL_DB_CONFIDENCE_ADMIN_DB_URL:
        'postgresql://postgres:admin-secret@localhost:5433/trama',
    })

    expect(env.NETLIFY_DB_URL).toBe('postgresql://app:secret@localhost:5433/trama')
    expect(env.QUERY_IT_DB_URL).toBe(
      'postgresql://postgres:admin-secret@localhost:5433/trama',
    )
    expect(env.BACKEND_DATA_IT_DB_URL).toBe(
      'postgresql://postgres:admin-secret@localhost:5433/trama',
    )
  })

  it('respeta URLs explícitas de integración por encima de la URL admin compartida', () => {
    const env = buildDbConfidenceEnv({
      LOCAL_DB_CONFIDENCE_ADMIN_DB_URL:
        'postgresql://postgres:admin-secret@localhost:5433/trama',
      QUERY_IT_DB_URL: 'postgresql://query:secret@localhost:5433/trama',
      BACKEND_DATA_IT_DB_URL: 'postgresql://backend:secret@localhost:5433/trama',
    })

    expect(env.QUERY_IT_DB_URL).toBe('postgresql://query:secret@localhost:5433/trama')
    expect(env.BACKEND_DATA_IT_DB_URL).toBe(
      'postgresql://backend:secret@localhost:5433/trama',
    )
  })

  it('corre CTE regression sin DATABASE_URL por defecto para evitar apuntar a la DB migrada', () => {
    const spawnSyncImpl = vi.fn(() => ({ status: 0 }))
    const stdout = vi.fn()

    const status = runLocalDbConfidence({
      env: {},
      spawnSyncImpl,
      stdout,
      stderr: vi.fn(),
    })

    expect(status).toBe(0)
    const cteEnv = spawnSyncImpl.mock.calls[0][2].env
    expect(spawnSyncImpl.mock.calls[0][1]).toEqual(['run', 'check:cte-regression'])
    expect(cteEnv.DATABASE_URL).toBeUndefined()
    expect(cteEnv.NETLIFY_DB_URL).toBeUndefined()
    expect(stdout.mock.calls.join('\n')).toContain('npm run db:up')
    expect(stdout.mock.calls.join('\n')).not.toContain('trama_local_dev')
  })

  it('redacta la URL admin opcional en logs', () => {
    const stdout = vi.fn()

    runLocalDbConfidence({
      env: {
        LOCAL_DB_CONFIDENCE_ADMIN_DB_URL:
          'postgresql://postgres:admin-secret@localhost:5433/trama',
      },
      spawnSyncImpl: vi.fn(() => ({ status: 0 })),
      stdout,
      stderr: vi.fn(),
    })

    const logs = stdout.mock.calls.join('\n')
    expect(logs).toContain('DB admin para integraciones')
    expect(logs).toContain('postgresql://localhost:5433/trama')
    expect(logs).not.toContain('admin-secret')
  })

  it('falla rápido con el status del primer gate roto', () => {
    const spawnSyncImpl = vi
      .fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 1 })
      .mockReturnValueOnce({ status: 0 })
    const stderr = vi.fn()

    const status = runLocalDbConfidence({
      env: {},
      spawnSyncImpl,
      stdout: vi.fn(),
      stderr,
    })

    expect(status).toBe(1)
    expect(spawnSyncImpl).toHaveBeenCalledTimes(2)
    expect(stderr.mock.calls.join('\n')).toContain('check:query-plans')
  })
})
