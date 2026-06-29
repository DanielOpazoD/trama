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

  it('GET no marca como huérfanas fotos referenciadas en payload photos legado', async () => {
    list.mockResolvedValue({
      blobs: [
        { key: 'legacy/a.jpg' },
        { key: 'legacy/b.jpg' },
        { key: 'legacy/audio.webm' },
        { key: 'orphan.jpg' },
      ],
    })
    mockSqlResponses.push([
      {
        payload: {
          photos: [{ storageKey: 'legacy/a.jpg' }, { storageKey: 'legacy/b.jpg' }],
          primaryStorageKey: 'legacy/a.jpg',
          audioKey: 'legacy/audio.webm',
        },
      },
    ])

    const res = await handler(
      new Request('http://localhost/api/momentos-orphaned-blobs'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      orphans: ['orphan.jpg'],
      referenced: 3,
      totalInStore: 4,
    })
  })

  it('POST adopta un blob y escribe el embedding en el INSERT, scopeado por user_id', async () => {
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
      ], // INSERT momento (embedding incluido) RETURNING
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
    // El embedding va en el INSERT (sin UPDATE posterior): atómico y scopeado.
    const insert = mockSqlState.calls.find((call) =>
      /INSERT INTO momentos/i.test(call.template),
    )
    expect(insert?.template).toMatch(/embedding/i)
    expect(insert?.values).toContain('legacy-single-user')
    expect(
      mockSqlState.calls.some((c) => /UPDATE momentos\s+SET embedding/i.test(c.template)),
    ).toBe(false)
  })
})
