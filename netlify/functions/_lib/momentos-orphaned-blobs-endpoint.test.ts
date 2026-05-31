import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const { getMetadata, list } = vi.hoisted(() => ({
  getMetadata: vi.fn(async () => ({ contentType: 'image/jpeg' })),
  list: vi.fn(async () => ({ blobs: [] as Array<{ key: string }> })),
}))

vi.mock('@netlify/blobs', () => ({
  getStore: () => ({
    getMetadata,
    list,
  }),
}))

vi.mock('./embeddings.js', () => ({
  embedSafe: vi.fn(async () => ({ vector: [0.1, 0.2], model: 'test-embed' })),
  toPgVector: (v: number[]) => `[${v.join(',')}]`,
}))

import handler from '../momentos-orphaned-blobs'

describe('momentos-orphaned-blobs endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    getMetadata.mockClear()
    list.mockClear()
    getMetadata.mockResolvedValue({ contentType: 'image/jpeg' })
    list.mockResolvedValue({ blobs: [] })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('POST adopta un blob y scopea el UPDATE de embedding por user_id', async () => {
    mockSqlResponses.push(
      [], // ensureUserRow
      [], // collectReferencedKeys
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          kind: 'foto',
          captured_at: '2026-05-31T00:00:00.000Z',
          payload: { storageKey: 'preview/photo.jpg' },
          note: 'foto rescatada',
          origin: { kind: 'imported', importedFrom: 'orphaned-blob-rescue' },
          created_at: '2026-05-31T00:00:00.000Z',
          updated_at: '2026-05-31T00:00:00.000Z',
        },
      ],
      [], // UPDATE embedding
    )

    const res = await handler(
      new Request('http://localhost/api/momentos-orphaned-blobs', {
        method: 'POST',
        body: JSON.stringify({
          storageKey: 'preview/photo.jpg',
          note: 'foto rescatada',
        }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(201)
    const update = mockSqlState.calls.find((call) =>
      /UPDATE momentos\s+SET embedding/i.test(call.template),
    )
    expect(update?.template).toMatch(/user_id = \?/)
    expect(update?.values).toContain('legacy-single-user')
  })
})
