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
  verifyToken: vi.fn().mockResolvedValue({ sub: 'user_quotes_xyz' }),
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
    mockSqlResponses.push([]) // ensureUserRow
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

  it('POST rechaza entity_id que no pertenece al usuario', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([]) // ownership lookup

    const res = await handler(
      requestWithToken('POST', {
        entity_id: '00000000-0000-0000-0000-000000000001',
        text: 'una cita ajena',
      }),
      mockContext(),
    )

    expect(res.status).toBe(404)
    const entityLookup = mockSqlState.calls.find((c) => /FROM entities/i.test(c.template))
    expect(entityLookup?.template).toMatch(/user_id/i)
    expect(entityLookup?.values).toContain('user_quotes_xyz')
    expect(mockSqlState.calls.some((c) => /INSERT INTO quotes/i.test(c.template))).toBe(
      false,
    )
  })

  it('POST rechaza linked_quote_ids que no pertenecen al usuario', async () => {
    const linkedQuoteId = '11111111-1111-4111-8111-111111111111'
    mockSqlResponses.reset()
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ name: 'Borges' }]) // entity ownership lookup
    mockSqlResponses.push([]) // linked quotes ownership lookup

    const res = await handler(
      requestWithToken('POST', {
        entity_id: '22222222-2222-4222-8222-222222222222',
        text: 'una cita con vínculo ajeno',
        linked_quote_ids: [linkedQuoteId],
      }),
      mockContext(),
    )

    expect(res.status).toBe(404)
    const linkedLookup = mockSqlState.calls.find(
      (c) => /FROM quotes/i.test(c.template) && /id = ANY/i.test(c.template),
    )
    expect(linkedLookup?.template).toMatch(/user_id/i)
    expect(linkedLookup?.values).toContain('user_quotes_xyz')
    expect(linkedLookup?.values).toContainEqual([linkedQuoteId])
    expect(mockSqlState.calls.some((c) => /INSERT INTO quotes/i.test(c.template))).toBe(
      false,
    )
  })

  it('PATCH rechaza linked_quote_ids que no pertenecen al usuario', async () => {
    const linkedQuoteId = '33333333-3333-4333-8333-333333333333'
    mockSqlResponses.reset()
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([]) // linked quotes ownership lookup

    const res = await handler(
      new Request('http://localhost/api/quotes/44444444-4444-4444-8444-444444444444', {
        method: 'PATCH',
        headers: { authorization: 'Bearer xyz-token' },
        body: JSON.stringify({ linked_quote_ids: [linkedQuoteId] }),
      }),
      mockContext({ id: '44444444-4444-4444-8444-444444444444' }),
    )

    expect(res.status).toBe(404)
    const linkedLookup = mockSqlState.calls.find(
      (c) => /FROM quotes/i.test(c.template) && /id = ANY/i.test(c.template),
    )
    expect(linkedLookup?.template).toMatch(/user_id/i)
    expect(linkedLookup?.values).toContain('user_quotes_xyz')
    expect(linkedLookup?.values).toContainEqual([linkedQuoteId])
    expect(mockSqlState.calls.some((c) => /UPDATE quotes/i.test(c.template))).toBe(false)
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
