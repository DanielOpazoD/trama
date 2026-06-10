import { describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

/**
 * Isolation tests cross-user para /api/momentos.
 *
 * Momentos tiene un campo extra (entity_ids) que se inserta a una tabla
 * link con user_id (momento_entities). Verificamos que tanto el momento como
 * sus links queden scoped al usuario autenticado.
 */

vi.mock('./db.js', () => setupMockSql())

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn().mockResolvedValue({ sub: 'user_mom_xyz' }),
  createClerkClient: () => ({
    users: { getUser: vi.fn().mockRejectedValue(new Error('not found')) },
  }),
}))

vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: async () => '',
    json: async () => ({}),
  }),
)

process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'

import handler from '../momentos'

function requestWithToken(method = 'GET', body?: unknown) {
  const init: RequestInit = {
    method,
    headers: { authorization: 'Bearer xyz-token' },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  return new Request('http://localhost/api/momentos', init)
}

describe('isolation cross-user — momentos endpoint', () => {
  it('GET wholesale incluye el userId en los values SQL', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([])
    await handler(requestWithToken(), mockContext())

    const allValues = mockSqlState.calls.flatMap((c) => c.values)
    expect(allValues).toContain('user_mom_xyz')
  })

  it('POST (crear momento nota) persiste el userId del authed user', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([]) // ensureUserRow
    // INSERT RETURNING
    mockSqlResponses.push([
      {
        id: 'new-uuid',
        kind: 'nota',
        captured_at: '2024-01-01T00:00:00Z',
        payload: { bodyText: 'una observación' },
        note: null,
        origin: { kind: 'manual' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ])
    await handler(
      requestWithToken('POST', {
        kind: 'nota',
        payload: { bodyText: 'una observación' },
      }),
      mockContext(),
    )

    const allValues = mockSqlState.calls.flatMap((c) => c.values)
    expect(allValues).toContain('user_mom_xyz')
  })

  it('POST rechaza entity_ids que no pertenecen al usuario', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ id: 'e-1' }])

    const res = await handler(
      requestWithToken('POST', {
        kind: 'nota',
        payload: { bodyText: 'una observación' },
        entity_ids: ['e-1', 'e-2'],
      }),
      mockContext(),
    )

    expect(res.status).toBe(404)
    const ownershipLookup = mockSqlState.calls.find((c) =>
      /FROM entities/i.test(c.template),
    )
    expect(ownershipLookup?.template).toMatch(/user_id/i)
    expect(ownershipLookup?.values).toContain('user_mom_xyz')
    expect(mockSqlState.calls.some((c) => /INSERT INTO momentos/i.test(c.template))).toBe(
      false,
    )
  })

  it('legacy mode sigue usando legacy-single-user', async () => {
    const original = process.env['CLERK_SECRET_KEY']
    delete process.env['CLERK_SECRET_KEY']
    vi.resetModules()
    const { default: freshHandler } = await import('../momentos')

    mockSqlResponses.reset()
    mockSqlResponses.push([])
    await freshHandler(
      new Request('http://localhost/api/momentos', { method: 'GET' }),
      mockContext(),
    )

    const allValues = mockSqlState.calls.flatMap((c) => c.values)
    expect(allValues).toContain('legacy-single-user')

    if (original) process.env['CLERK_SECRET_KEY'] = original
  })
})
