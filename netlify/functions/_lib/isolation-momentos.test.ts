import { describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

/**
 * Isolation tests cross-user para /api/momentos.
 *
 * Momentos tiene un campo extra (entity_ids) que se inserta a una tabla
 * link sin user_id (momento_entities); el link queda implícitamente
 * scoped via la FK al momento. Lo que verificamos es que las queries
 * sobre la tabla momentos misma siempre incluyan el userId.
 */

vi.mock('./db.js', () => setupMockSql())

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn().mockResolvedValue({ sub: 'user_mom_xyz' }),
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
