import { beforeEach, describe, expect, it, vi } from 'vitest'

const pgMock = vi.hoisted(() => {
  const state = {
    queryCalls: [],
    end: vi.fn(),
    release: vi.fn(),
  }
  const client = {
    query: vi.fn(async (text, values) => {
      state.queryCalls.push([text, values])
      if (String(text).startsWith('EXPLAIN')) {
        return {
          rows: [
            {
              'QUERY PLAN': [
                {
                  Plan: {
                    'Node Type': 'Index Scan',
                    'Relation Name': 'entities',
                    'Plan Rows': 1,
                  },
                },
              ],
            },
          ],
        }
      }
      return { rows: [] }
    }),
    release: state.release,
  }
  const pool = {
    connect: vi.fn(async () => client),
    end: state.end,
  }
  const Pool = vi.fn(function Pool() {
    return pool
  })
  return {
    client,
    pool,
    Pool,
    reset() {
      state.queryCalls.length = 0
      state.end.mockClear()
      state.release.mockClear()
      client.query.mockClear()
      pool.connect.mockClear()
      this.Pool.mockClear()
    },
    get queryTexts() {
      return state.queryCalls.map(([text]) => text)
    },
  }
})

vi.mock('pg', () => ({
  default: {
    Pool: pgMock.Pool,
  },
}))

import {
  assertNoLargeSeqScans,
  collectPlanNodes,
  formatQueryPlanCheckFailure,
  resolveQueryPlanDbConfig,
  runQueryPlanCheck,
  sanitizeDbUrlForLog,
  setQueryPlanRlsContext,
} from './check-query-plans.mjs'

function plan(node) {
  return [{ Plan: node }]
}

describe('check-query-plans', () => {
  beforeEach(() => {
    pgMock.reset()
  })

  it('recorre nodos anidados de un EXPLAIN JSON', () => {
    const nodes = collectPlanNodes(
      plan({
        'Node Type': 'Nested Loop',
        Plans: [
          { 'Node Type': 'Index Scan', 'Relation Name': 'entities' },
          {
            'Node Type': 'Bitmap Heap Scan',
            Plans: [{ 'Node Type': 'Bitmap Index Scan' }],
          },
        ],
      }),
    )

    expect(nodes.map((node) => node['Node Type'])).toEqual([
      'Nested Loop',
      'Index Scan',
      'Bitmap Heap Scan',
      'Bitmap Index Scan',
    ])
  })

  it('falla ante seq scans grandes no allowlisteados', () => {
    expect(() =>
      assertNoLargeSeqScans(
        'entities.hot-list',
        plan({
          'Node Type': 'Seq Scan',
          'Relation Name': 'entities',
          'Plan Rows': 5000,
        }),
      ),
    ).toThrow(/entities\.hot-list.*Seq Scan.*entities/s)
  })

  it('falla ante parallel seq scans grandes no allowlisteados', () => {
    expect(() =>
      assertNoLargeSeqScans(
        'entities.parallel',
        plan({
          'Node Type': 'Parallel Seq Scan',
          'Relation Name': 'entities',
          'Plan Rows': 5000,
        }),
      ),
    ).toThrow(/entities\.parallel.*Parallel Seq Scan.*entities/s)
  })

  it('permite seq scans chicos o allowlisteados', () => {
    expect(() =>
      assertNoLargeSeqScans(
        'tiny.lookup',
        plan({
          'Node Type': 'Seq Scan',
          'Relation Name': 'entity_types',
          'Plan Rows': 8,
        }),
      ),
    ).not.toThrow()

    expect(() =>
      assertNoLargeSeqScans(
        'catalog.lookup',
        plan({
          'Node Type': 'Seq Scan',
          'Relation Name': 'entity_types',
          'Plan Rows': 5000,
        }),
        { allowedRelations: ['entity_types'] },
      ),
    ).not.toThrow()
  })

  it('redacta credenciales de la URL de DB al reportar errores', () => {
    expect(sanitizeDbUrlForLog('postgresql://trama:secret@localhost:5433/trama')).toBe(
      'postgresql://localhost:5433/trama',
    )

    expect(sanitizeDbUrlForLog('not a url')).toBe('[unparseable database URL]')
  })

  it('convierte ECONNREFUSED contra la DB local en instrucciones accionables', () => {
    const error = new AggregateError(
      [
        Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5433'), {
          code: 'ECONNREFUSED',
          address: '127.0.0.1',
          port: 5433,
        }),
        Object.assign(new Error('connect ECONNREFUSED ::1:5433'), {
          code: 'ECONNREFUSED',
          address: '::1',
          port: 5433,
        }),
      ],
      '',
    )
    Object.assign(error, { code: 'ECONNREFUSED' })

    const message = formatQueryPlanCheckFailure({
      dbUrl: 'postgresql://trama:trama_local_dev@localhost:5433/trama',
      error,
    })

    expect(message).toContain('check:query-plans no pudo conectar a Postgres')
    expect(message).toContain('npm run db:up')
    expect(message).toContain('npm run db:reset')
    expect(message).toContain('npm run local:db-confidence')
    expect(message).toContain('DATABASE_URL')
    expect(message).toContain('NETLIFY_DB_URL')
    expect(message).not.toContain('NETLIFY_DATABASE_URL')
    expect(message).toContain('postgresql://localhost:5433/trama')
    expect(message).not.toContain('trama_local_dev')
    expect(message).not.toContain('AggregateError')
  })

  it('explica como aplicar migraciones cuando la DB existe pero falta schema', () => {
    const message = formatQueryPlanCheckFailure({
      dbUrl: 'postgresql://trama:secret@localhost:5433/trama',
      error: Object.assign(new Error('relation "entities" does not exist'), {
        code: '42P01',
      }),
    })

    expect(message).toContain('check:query-plans encontro una DB sin schema migrado')
    expect(message).toContain('scripts/apply-migrations.sh')
    expect(message).toContain('npm run db:reset')
    expect(message).toContain('postgresql://localhost:5433/trama')
    expect(message).not.toContain('secret')
  })

  it('declara prioridad de URL runtime para el check local', () => {
    expect(resolveQueryPlanDbConfig({})).toEqual({
      dbUrl: 'postgresql://trama:trama_local_dev@localhost:5433/trama',
      source: 'default local Postgres',
    })
    expect(
      resolveQueryPlanDbConfig({
        NETLIFY_DB_URL: 'postgresql://netlify@example.test/trama',
      }),
    ).toEqual({
      dbUrl: 'postgresql://netlify@example.test/trama',
      source: 'NETLIFY_DB_URL',
    })
    expect(
      resolveQueryPlanDbConfig({
        DATABASE_URL: 'postgresql://database@example.test/trama',
        NETLIFY_DB_URL: 'postgresql://netlify@example.test/trama',
      }),
    ).toEqual({
      dbUrl: 'postgresql://database@example.test/trama',
      source: 'DATABASE_URL',
    })
  })

  it('setea contexto RLS de fixture antes de sembrar datos privados', async () => {
    const queryCalls = []
    const client = {
      query: async (...args) => {
        queryCalls.push(args)
        return { rows: [] }
      },
    }

    await setQueryPlanRlsContext(client, 'query-plan-test-user')

    expect(queryCalls).toEqual([
      ["SELECT set_config('app.current_user_id', $1, true)", ['query-plan-test-user']],
    ])
  })

  it('hace rollback en una corrida exitosa para no persistir fixtures de query plans', async () => {
    await runQueryPlanCheck({ dbUrl: 'postgresql://trama:secret@localhost:5433/trama' })

    expect(pgMock.queryTexts).toContain('BEGIN')
    expect(pgMock.queryTexts).toContain('ROLLBACK')
    expect(pgMock.queryTexts).not.toContain('COMMIT')
    expect(pgMock.client.release).toHaveBeenCalledTimes(1)
    expect(pgMock.pool.end).toHaveBeenCalledTimes(1)
  })
})
