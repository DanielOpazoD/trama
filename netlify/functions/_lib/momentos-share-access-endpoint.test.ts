import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const verifyTokenMock = vi.hoisted(() => vi.fn())
vi.mock('@clerk/backend', () => ({
  verifyToken: verifyTokenMock,
}))

process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'

import handler from '../momentos-share-access'

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

describe('momentos-share-access endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    verifyTokenMock.mockReset()
    verifyTokenMock.mockResolvedValue({
      sub: 'user_mama',
      email: 'mama@example.com',
    })
  })

  it('GET lista espacios compartidos aceptados del usuario actual', async () => {
    mockSqlResponses.push([
      {
        user_id: 'user_papa',
        display_name: 'Papá',
        email: 'papa@example.com',
        role: 'editor',
        accepted_at: '2026-06-10T00:00:00Z',
      },
    ])

    const res = await handler(
      authedRequest('http://localhost/api/momentos-share-access'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: Array<{ userId: string }> }
    expect(body.items).toEqual([
      expect.objectContaining({
        userId: 'user_papa',
        displayName: 'Papá',
        email: 'papa@example.com',
        role: 'editor',
      }),
    ])
    const query =
      mockSqlResponses.calls.find((c) => /FROM momento_space_access/i.test(c.template))
        ?.template ?? ''
    expect(query).toMatch(/FROM momento_space_access/i)
    expect(query).toMatch(/owner_user_id = \?/i)
    expect(query).toMatch(/member_user_id = \?/i)
  })

  it('DELETE revoca el espacio compartido en ambas direcciones', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ revoked: true }])

    const res = await handler(
      authedRequest('http://localhost/api/momentos-share-access/user_papa', {
        method: 'DELETE',
      }),
      mockContext({ userId: 'user_papa' }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { revoked: boolean }
    expect(body.revoked).toBe(true)
    const query =
      mockSqlResponses.calls.find((c) => /UPDATE momento_space_access/i.test(c.template))
        ?.template ?? ''
    expect(query).toMatch(/UPDATE momento_space_access/i)
    expect(query).toMatch(/owner_user_id = \? AND member_user_id = \?/i)
    expect(query).toMatch(/member_user_id = \? AND owner_user_id = \?/i)
    expect(query).toMatch(/deleted_at = NOW\(\)/i)
  })
})
