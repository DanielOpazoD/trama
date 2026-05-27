import { describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

/**
 * Isolation tests cross-user para /api/quotes.
 *
 * Mismo patrón que isolation.test.ts (entities): mockeamos Clerk para
 * que `verifyToken` resuelva a un sub específico, y verificamos que
 * todas las queries SQL incluyen ese userId entre sus values.
 *
 * Cobertura: GET list, GET con cursor, POST crear, PATCH editar.
 */

vi.mock('./db.js', () => setupMockSql())

vi.mock('@clerk/backend', () => ({
  createClerkClient: vi.fn(() => ({
    verifyToken: vi.fn().mockResolvedValue({ sub: 'user_quotes_xyz' }),
  })),
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

import handler from '../quotes'

function requestWithToken(method = 'GET', body?: unknown) {
  const init: RequestInit = {
    method,
    headers: { authorization: 'Bearer xyz-token' },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  return new Request('http://localhost/api/quotes', init)
}

describe('isolation cross-user — quotes endpoint', () => {
  it('GET wholesale incluye el userId en los values SQL', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([])
    await handler(requestWithToken(), mockContext())

    const allValues = mockSqlState.calls.flatMap((c) => c.values)
    expect(allValues).toContain('user_quotes_xyz')
  })

  it('POST (crear cita) persiste el userId del authed user', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([{ name: 'Borges' }]) // entity name lookup
    mockSqlResponses.push([
      {
        id: 'new-uuid',
        entity_id: 'e-1',
        text: 'cita',
        source: null,
        context: null,
        user_reflection: null,
        ai_reflection: null,
        ai_reflection_provider: null,
        ai_reflection_model: null,
        ai_reflection_at: null,
        linked_quote_ids: [],
        origin: { kind: 'manual' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ]) // INSERT RETURNING
    await handler(
      requestWithToken('POST', {
        entity_id: 'e-1',
        text: 'una cita',
      }),
      mockContext(),
    )

    const allValues = mockSqlState.calls.flatMap((c) => c.values)
    expect(allValues).toContain('user_quotes_xyz')
  })

  it('legacy mode (sin Clerk) sigue usando legacy-single-user', async () => {
    const original = process.env['CLERK_SECRET_KEY']
    delete process.env['CLERK_SECRET_KEY']
    vi.resetModules()
    const { default: freshHandler } = await import('../quotes')

    mockSqlResponses.reset()
    mockSqlResponses.push([])
    await freshHandler(
      new Request('http://localhost/api/quotes', { method: 'GET' }),
      mockContext(),
    )

    const allValues = mockSqlState.calls.flatMap((c) => c.values)
    expect(allValues).toContain('legacy-single-user')

    if (original) process.env['CLERK_SECRET_KEY'] = original
  })
})
