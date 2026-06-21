import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  expectCanonicalError,
  mockContext,
  mockSqlResponses,
  mockSqlState,
  setupMockSql,
} from './test-utils'
import { buildApiRequest } from './test-fixtures'

vi.mock('./db.js', () => setupMockSql())

import handler from '../biblioteca'

function libraryRow(overrides: Record<string, unknown> = {}) {
  return {
    item_kind: 'notas-attachment',
    item_id: 'a1',
    title: 'nota.txt',
    mime_type: 'text/plain',
    byte_size: 42,
    file_type: 'document',
    source: 'subido',
    storage_key: 'legacy-single-user/a1.txt',
    storage_domain: 'notas-attachments',
    tags: [],
    pinned: false,
    ai_status: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('biblioteca endpoint — integration (mock SQL)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockSqlResponses.reset()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('GET devuelve items mapeados + nextCursor null cuando entran en una página', async () => {
    mockSqlResponses.push([libraryRow({ item_id: 'a1' }), libraryRow({ item_id: 'a2' })])

    const res = await handler(buildApiRequest('/api/biblioteca'), mockContext())

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: Array<{ item_kind: string; item_id: string }>
      nextCursor: unknown
    }
    expect(body.items).toHaveLength(2)
    // El endpoint reenvía filas snake_case (el cliente las mapea).
    expect(body.items[0]).toMatchObject({ item_kind: 'notas-attachment', item_id: 'a1' })
    expect(body.nextCursor).toBeNull()

    // La query corre scoped al usuario legacy.
    const call = mockSqlState.calls.at(-1)
    expect(call?.template).toMatch(/FROM joined/i)
    expect(call?.values).toContain('legacy-single-user')
  })

  it('GET respeta el límite y emite nextCursor (offset) cuando hay más filas', async () => {
    mockSqlResponses.push([
      libraryRow({ item_id: 'a1', updated_at: '2026-06-03T00:00:00.000Z' }),
      libraryRow({ item_id: 'a2', updated_at: '2026-06-02T00:00:00.000Z' }),
      libraryRow({ item_id: 'a3', updated_at: '2026-06-01T00:00:00.000Z' }),
    ])

    const res = await handler(
      buildApiRequest('/api/biblioteca', { query: { limit: '2' } }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: Array<{ item_id: string }>
      nextCursor: string | null
    }
    expect(body.items.map((i) => i.item_id)).toEqual(['a1', 'a2'])
    expect(body.nextCursor).toBe('2')
  })

  it('rechaza métodos no-GET con error canónico', async () => {
    const res = await handler(
      buildApiRequest('/api/biblioteca', {
        method: 'POST',
        requestId: 'rid-biblioteca-post',
      }),
      mockContext(),
    )

    await expectCanonicalError(res, {
      status: 405,
      code: 'METHOD_NOT_ALLOWED',
      requestId: 'rid-biblioteca-post',
    })
  })
})
