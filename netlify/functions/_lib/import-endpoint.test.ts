import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
vi.mock('./import-ids.js', () => ({
  resolveImportId: (id: string, userId: string) => `${userId}:${id}`,
}))
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn().mockResolvedValue({ sub: 'user_import_xyz' }),
}))

import handler from '../import'

describe('import endpoint', () => {
  const originalClerk = process.env['CLERK_SECRET_KEY']
  const originalFallback = process.env['ALLOW_LEGACY_FALLBACK']

  beforeEach(() => {
    mockSqlResponses.reset()
    delete process.env['CLERK_SECRET_KEY']
    delete process.env['ALLOW_LEGACY_FALLBACK']
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalClerk === undefined) delete process.env['CLERK_SECRET_KEY']
    else process.env['CLERK_SECRET_KEY'] = originalClerk
    if (originalFallback === undefined) delete process.env['ALLOW_LEGACY_FALLBACK']
    else process.env['ALLOW_LEGACY_FALLBACK'] = originalFallback
  })

  it('registra fallos por item con userId explícito en modo Clerk estricto', async () => {
    process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'
    process.env['ALLOW_LEGACY_FALLBACK'] = 'false'
    const sqlError = new Error('insert failed')
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlState.responses.push(Promise.reject(sqlError) as unknown as unknown[])
    mockSqlResponses.push([]) // persistError INSERT

    const res = await handler(
      new Request('http://localhost/api/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer import-token',
        },
        body: JSON.stringify({
          version: 1,
          entities: [{ id: 'e1', type: 'persona', name: 'Ada' }],
        }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.failed).toEqual([{ kind: 'entity', id: 'e1', reason: 'insert failed' }])
    const errorInsert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO error_log/i.test(c.template),
    )
    expect(errorInsert?.values).toContain('user_import_xyz')
    expect(errorInsert?.values).not.toContain('legacy-single-user')
  })

  it('salta items importados no-objeto sin abortar el import completo', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ id: 'legacy-single-user:e1' }]) // INSERT entidad valida

    const res = await handler(
      new Request('http://localhost/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          entities: [null, 42, {}, { id: 'e1', type: 'persona', name: 'Ada' }],
          relationships: [null, {}],
          quotes: ['texto suelto', {}],
        }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      imported: 1,
      skipped: 7,
      failed: [],
    })
  })
})
