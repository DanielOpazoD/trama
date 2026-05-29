import { describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

/**
 * Isolation tests cross-user para /api/relationships.
 */

vi.mock('./db.js', () => setupMockSql())

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn().mockResolvedValue({ sub: 'user_rels_xyz' }),
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

import handler from '../relationships'

function requestWithToken(method = 'GET', body?: unknown) {
  const init: RequestInit = {
    method,
    headers: { authorization: 'Bearer xyz-token' },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  return new Request('http://localhost/api/relationships', init)
}

describe('isolation cross-user — relationships endpoint', () => {
  it('GET wholesale incluye el userId en los values SQL', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([])
    await handler(requestWithToken(), mockContext())

    const allValues = mockSqlState.calls.flatMap((c) => c.values)
    expect(allValues).toContain('user_rels_xyz')
  })

  it('POST (crear relación) persiste el userId del authed user', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([
      {
        id: 'new-uuid',
        from_id: 'e-1',
        to_id: 'e-2',
        type: 'influencia',
        notes: null,
        origin: { kind: 'manual' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ])
    await handler(
      requestWithToken('POST', {
        from_id: 'e-1',
        to_id: 'e-2',
        type: 'influencia',
      }),
      mockContext(),
    )

    const allValues = mockSqlState.calls.flatMap((c) => c.values)
    expect(allValues).toContain('user_rels_xyz')
  })

  it('legacy mode sigue usando legacy-single-user', async () => {
    const original = process.env['CLERK_SECRET_KEY']
    delete process.env['CLERK_SECRET_KEY']
    vi.resetModules()
    const { default: freshHandler } = await import('../relationships')

    mockSqlResponses.reset()
    mockSqlResponses.push([])
    await freshHandler(
      new Request('http://localhost/api/relationships', { method: 'GET' }),
      mockContext(),
    )

    const allValues = mockSqlState.calls.flatMap((c) => c.values)
    expect(allValues).toContain('legacy-single-user')

    if (original) process.env['CLERK_SECRET_KEY'] = original
  })
})
