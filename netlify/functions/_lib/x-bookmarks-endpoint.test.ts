import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../x-bookmarks'

/**
 * /api/x/bookmarks — lista los bookmarks guardados (camelCase) con paginación
 * por cursor. Cubre: método inválido, transform snake→camel, y el cálculo de
 * nextCursor (pide limit+1 y corta).
 */
function row(i: number) {
  return {
    id: `b${i}`,
    tweet_id: `t${i}`,
    text: `tweet ${i}`,
    author_id: 'a1',
    author_name: 'Autor',
    author_username: 'autor',
    tweet_created_at: '2026-05-01T00:00:00.000Z',
    url: `https://x.com/autor/status/t${i}`,
    captured_at: `2026-05-30T00:00:0${i}.000Z`,
  }
}

describe('x-bookmarks endpoint', () => {
  beforeEach(() => mockSqlResponses.reset())
  afterEach(() => vi.unstubAllGlobals())

  it('método no GET devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/x/bookmarks', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  it('transforma a camelCase y sin más páginas deja nextCursor null', async () => {
    mockSqlResponses.push([row(1), row(2)])
    const res = await handler(
      new Request('http://localhost/api/x/bookmarks?limit=50'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nextCursor).toBeNull()
    expect(body.items).toHaveLength(2)
    expect(body.items[0]).toMatchObject({
      id: 'b1',
      tweetId: 't1',
      text: 'tweet 1',
      authorUsername: 'autor',
      url: 'https://x.com/autor/status/t1',
    })
  })

  it('con más filas que el límite, recorta y expone nextCursor', async () => {
    // limit=2 → el handler pide 3; devolvemos 3 ⇒ hay siguiente página.
    mockSqlResponses.push([row(1), row(2), row(3)])
    const res = await handler(
      new Request('http://localhost/api/x/bookmarks?limit=2'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(2)
    expect(body.nextCursor).toBe('2026-05-30T00:00:02.000Z')
  })
})
