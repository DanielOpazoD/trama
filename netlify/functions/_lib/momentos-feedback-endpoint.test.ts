import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const verifyTokenMock = vi.hoisted(() => vi.fn())
vi.mock('@clerk/backend', () => ({
  verifyToken: verifyTokenMock,
  createClerkClient: () => ({
    users: { getUser: vi.fn().mockRejectedValue(new Error('not found')) },
  }),
}))

process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'

import handler from '../momentos-feedback'

function authedRequest(url: string, init: RequestInit = {}) {
  return new Request(url, {
    ...init,
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

describe('momentos-feedback endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    verifyTokenMock.mockReset()
    verifyTokenMock.mockResolvedValue({
      sub: 'user_viewer',
      email: 'mama@example.com',
    })
  })

  it('GET devuelve comentarios y reacciones de un Momento compartido legible', async () => {
    mockSqlResponses.push([
      {
        owner_user_id: 'user_owner',
        access_role: 'viewer',
      },
    ])
    mockSqlResponses.push([
      {
        id: 'comment-1',
        momento_id: 'mom-1',
        author_user_id: 'user_owner',
        author_display_name: 'Papá',
        author_email: 'papa@example.com',
        body: 'Primer paseo en bici.',
        can_delete: true,
        created_at: '2026-06-11T12:00:00Z',
        updated_at: '2026-06-11T12:00:00Z',
      },
    ])
    mockSqlResponses.push([
      {
        reaction: 'heart',
        count: 2,
        reacted_by_me: true,
      },
    ])

    const res = await handler(
      authedRequest('http://localhost/api/momentos-feedback/mom-1'),
      mockContext({ momentoId: 'mom-1' }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      comments: Array<{ id: string; authorDisplayName?: string }>
      reactions: Array<{ reaction: string; count: number; reactedByMe: boolean }>
    }
    expect(body.comments).toEqual([
      expect.objectContaining({
        id: 'comment-1',
        authorDisplayName: 'Papá',
        canDelete: true,
      }),
    ])
    expect(body.reactions).toEqual([{ reaction: 'heart', count: 2, reactedByMe: true }])

    const accessQuery = mockSqlResponses.calls[0]?.template ?? ''
    expect(accessQuery).toMatch(/FROM momentos m/i)
    expect(accessQuery).toMatch(/momento_space_access/i)
    expect(accessQuery).toMatch(/m\.deleted_at IS NULL/i)
  })

  it('POST permite comentar a un lector compartido sin darle permisos de edición', async () => {
    mockSqlResponses.push([{ owner_user_id: 'user_owner', access_role: 'viewer' }])
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([
      {
        id: 'comment-2',
        momento_id: 'mom-1',
        author_user_id: 'user_viewer',
        author_display_name: 'Mamá',
        author_email: 'mama@example.com',
        body: 'Me encanta esta foto.',
        created_at: '2026-06-11T12:10:00Z',
        updated_at: '2026-06-11T12:10:00Z',
      },
    ])

    const res = await handler(
      authedRequest('http://localhost/api/momentos-feedback/mom-1', {
        method: 'POST',
        body: JSON.stringify({ body: 'Me encanta esta foto.' }),
      }),
      mockContext({ momentoId: 'mom-1' }),
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as { comment: { body: string } }
    expect(body.comment.body).toBe('Me encanta esta foto.')
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO momento_comments/i.test(c.template),
    )
    expect(insert?.values).toContain('Me encanta esta foto.')
  })

  it('PUT activa reacción simple para cualquier usuario con acceso de lectura', async () => {
    mockSqlResponses.push([{ owner_user_id: 'user_owner', access_role: 'viewer' }])
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([]) // upsert reaction
    mockSqlResponses.push([
      {
        reaction: 'heart',
        count: 1,
        reacted_by_me: true,
      },
    ])

    const res = await handler(
      authedRequest('http://localhost/api/momentos-feedback/mom-1', {
        method: 'PUT',
        body: JSON.stringify({ reaction: 'heart' }),
      }),
      mockContext({ momentoId: 'mom-1' }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      reaction: { reaction: string; count: number; reactedByMe: boolean }
    }
    expect(body.reaction).toEqual({ reaction: 'heart', count: 1, reactedByMe: true })
    const upsert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO momento_reactions/i.test(c.template),
    )
    expect(upsert?.template).toMatch(/deleted_at = NULL/i)
  })

  it('bloquea a usuarios sin acceso sin filtrar la existencia del Momento', async () => {
    mockSqlResponses.push([])

    const res = await handler(
      authedRequest('http://localhost/api/momentos-feedback/mom-1', {
        method: 'POST',
        body: JSON.stringify({ body: 'No debería pasar.' }),
      }),
      mockContext({ momentoId: 'mom-1' }),
    )

    expect(res.status).toBe(404)
    expect(
      mockSqlResponses.calls.some((c) =>
        /INSERT INTO momento_comments/i.test(c.template),
      ),
    ).toBe(false)
  })
})
