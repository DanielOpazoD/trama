import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../x-bookmarks'

/**
 * /api/x/bookmarks — GET lista (camelCase, ordenada por fecha del tweet) y
 * DELETE soft-delete por id. Cubre: método inválido, transform, y el borrado
 * (200 si afecta una fila, 404 si no, 400 sin id).
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

  it('método no soportado (PUT) devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/x/bookmarks', { method: 'PUT' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  it('GET transforma a camelCase', async () => {
    mockSqlResponses.push([row(1), row(2)])
    const res = await handler(
      new Request('http://localhost/api/x/bookmarks'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(2)
    expect(body.items[0]).toMatchObject({
      id: 'b1',
      tweetId: 't1',
      text: 'tweet 1',
      authorUsername: 'autor',
      url: 'https://x.com/autor/status/t1',
    })
    expect(body.items[0]).not.toHaveProperty('tweet_id')
  })

  it('DELETE sin id → 400', async () => {
    const res = await handler(
      new Request('http://localhost/api/x/bookmarks', { method: 'DELETE' }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('DELETE de un bookmark existente → 200 ok', async () => {
    mockSqlResponses.push([{ id: 'b1' }]) // UPDATE ... RETURNING id
    const res = await handler(
      new Request('http://localhost/api/x/bookmarks?id=b1', { method: 'DELETE' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('DELETE de un id inexistente → 404', async () => {
    mockSqlResponses.push([]) // UPDATE no afectó filas
    const res = await handler(
      new Request('http://localhost/api/x/bookmarks?id=nope', { method: 'DELETE' }),
      mockContext(),
    )
    expect(res.status).toBe(404)
  })
})
