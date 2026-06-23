import { describe, expect, it } from 'vitest'
import { assertNoLargeSeqScans, collectPlanNodes } from './check-query-plans.mjs'

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
})
