import { describe, expect, it } from 'vitest'
import { makeQueryClient } from '../test-utils'
import {
  restoreQueriesSnapshot,
  restoreQuerySnapshot,
  snapshotQueries,
  snapshotQuery,
} from './cacheOptimistic'

describe('cacheOptimistic', () => {
  it('snapshotQuery restaura una cache puntual tras un rollback optimista', () => {
    const qc = makeQueryClient()
    const key = ['notes'] as const
    const previous = [{ id: 'n1', title: 'Antes' }]
    qc.setQueryData(key, previous)

    const snap = snapshotQuery(qc, key)
    qc.setQueryData(key, [{ id: 'n1', title: 'Optimista' }])

    restoreQuerySnapshot(qc, snap)

    expect(qc.getQueryData(key)).toEqual(previous)
  })

  it('snapshotQueries restaura todas las variantes bajo un prefijo', () => {
    const qc = makeQueryClient()
    const allKey = ['notas-feed', 'all'] as const
    const pendingKey = ['notas-feed', 'pending'] as const
    qc.setQueryData(allKey, { pages: [{ items: ['a'] }] })
    qc.setQueryData(pendingKey, { pages: [{ items: ['p'] }] })

    const snap = snapshotQueries(qc, { queryKey: ['notas-feed'] as const })
    qc.setQueryData(allKey, { pages: [{ items: ['changed'] }] })
    qc.setQueryData(pendingKey, { pages: [{ items: [] }] })

    restoreQueriesSnapshot(qc, snap)

    expect(qc.getQueryData(allKey)).toEqual({ pages: [{ items: ['a'] }] })
    expect(qc.getQueryData(pendingKey)).toEqual({ pages: [{ items: ['p'] }] })
  })
})
