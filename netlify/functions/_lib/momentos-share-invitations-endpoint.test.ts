import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const verifyTokenMock = vi.hoisted(() => vi.fn())
vi.mock('@clerk/backend', () => ({
  verifyToken: verifyTokenMock,
}))

process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'

import handler from '../momentos-share-invitations'

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

describe('momentos-share-invitations endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    verifyTokenMock.mockReset()
    verifyTokenMock.mockResolvedValue({
      sub: 'user_invitee',
      email: 'mama@example.com',
    })
  })

  it('GET lista invitaciones pendientes para el correo autenticado', async () => {
    mockSqlResponses.push([
      {
        id: 'inv-1',
        inviter_user_id: 'user_owner',
        inviter_display_name: 'Papá',
        inviter_email: 'papa@example.com',
        invitee_email: 'mama@example.com',
        invitee_user_id: null,
        role: 'editor',
        status: 'pending',
        responded_at: null,
        created_at: '2026-06-10T00:00:00Z',
        updated_at: '2026-06-10T00:00:00Z',
      },
    ])

    const res = await handler(
      authedRequest('http://localhost/api/momentos-share-invitations'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: Array<{ id: string; role: string }> }
    expect(body.items).toEqual([expect.objectContaining({ id: 'inv-1', role: 'editor' })])
    const query = mockSqlResponses.calls.find((c) =>
      /FROM momento_space_invitations/i.test(c.template),
    )
    expect(query?.template).toMatch(/lower\(i\.invitee_email\) = \?/i)
    expect(query?.values).toContain('mama@example.com')
  })

  it('GET resuelve el correo desde users si Clerk no lo incluye en el token', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'user_invitee' })
    mockSqlResponses.push([{ email: 'mama@example.com' }])
    mockSqlResponses.push([
      {
        id: 'inv-1',
        inviter_user_id: 'user_owner',
        inviter_display_name: 'Papá',
        inviter_email: 'papa@example.com',
        invitee_email: 'mama@example.com',
        invitee_user_id: null,
        role: 'viewer',
        status: 'pending',
        responded_at: null,
        created_at: '2026-06-10T00:00:00Z',
        updated_at: '2026-06-10T00:00:00Z',
      },
    ])

    const res = await handler(
      authedRequest('http://localhost/api/momentos-share-invitations'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: Array<{ id: string }> }
    expect(body.items).toEqual([expect.objectContaining({ id: 'inv-1' })])
    expect(mockSqlResponses.calls[0]?.template).toMatch(/SELECT email\s+FROM users/i)
    expect(mockSqlResponses.calls[0]?.values).toContain('user_invitee')
  })

  it('POST crea invitación global al espacio de Momentos y devuelve invitador', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([
      {
        id: 'inv-2',
        inviter_user_id: 'user_invitee',
        inviter_display_name: 'Mamá',
        inviter_email: 'mama@example.com',
        invitee_email: 'papa@example.com',
        invitee_user_id: null,
        role: 'editor',
        status: 'pending',
        responded_at: null,
        created_at: '2026-06-10T00:00:00Z',
        updated_at: '2026-06-10T00:00:00Z',
      },
    ])

    const res = await handler(
      authedRequest('http://localhost/api/momentos-share-invitations', {
        method: 'POST',
        body: JSON.stringify({
          email: 'Papa@Example.com',
          role: 'editor',
        }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      inviterDisplayName?: string
      inviteeEmail: string
    }
    expect(body.inviterDisplayName).toBe('Mamá')
    expect(body.inviteeEmail).toBe('papa@example.com')
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO momento_space_invitations/i.test(c.template),
    )
    expect(insert?.template).toMatch(/JOIN users inviter/i)
    expect(insert?.template).not.toMatch(/momento_id/i)
  })

  it('POST bloquea auto-invitación usando el email guardado en users', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'user_invitee' })
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ email: 'mama@example.com' }])

    const res = await handler(
      authedRequest('http://localhost/api/momentos-share-invitations', {
        method: 'POST',
        body: JSON.stringify({
          email: 'MAMA@example.com',
          role: 'viewer',
        }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(400)
    expect(mockSqlResponses.calls.some((c) => /FROM momentos/i.test(c.template))).toBe(
      false,
    )
  })

  it('PATCH accept crea acceso recíproco al espacio de Momentos y marca aceptada', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([
      {
        id: 'inv-1',
        inviter_user_id: 'user_owner',
        inviter_display_name: 'Papá',
        inviter_email: 'papa@example.com',
        invitee_email: 'mama@example.com',
        invitee_user_id: 'user_invitee',
        role: 'viewer',
        status: 'accepted',
        responded_at: '2026-06-10T00:01:00Z',
        created_at: '2026-06-10T00:00:00Z',
        updated_at: '2026-06-10T00:01:00Z',
      },
    ])

    const res = await handler(
      authedRequest('http://localhost/api/momentos-share-invitations/inv-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'accept' }),
      }),
      mockContext({ id: 'inv-1' }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('accepted')
    const cte = mockSqlResponses.calls.find((c) => /grants AS/i.test(c.template))
    expect(cte?.template).toMatch(/INSERT INTO momento_space_access/i)
    expect(cte?.template).toMatch(/UNION ALL/i)
    expect(cte?.template).toMatch(/owner_user_id, member_user_id/i)
    expect(cte?.template).toMatch(/status = 'accepted'/i)
  })
})
