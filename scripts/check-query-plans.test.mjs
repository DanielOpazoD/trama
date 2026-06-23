import { describe, expect, it } from 'vitest'
import {
  assertNoLargeSeqScans,
  collectPlanNodes,
  formatQueryPlanCheckFailure,
  sanitizeDbUrlForLog,
  setQueryPlanRlsContext,
} from './check-query-plans.mjs'

function plan(node) {
  return [{ Plan: node }]
}

describe('check-query-plans', () => {
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
    expect(message).toContain('npm run local:db-confidence')
    expect(message).toContain('DATABASE_URL')
    expect(message).toContain('postgresql://localhost:5433/trama')
    expect(message).not.toContain('trama_local_dev')
    expect(message).not.toContain('AggregateError')
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
})
