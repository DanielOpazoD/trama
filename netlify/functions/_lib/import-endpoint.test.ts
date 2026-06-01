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
      scope: {
        kind: 'structured-core',
        completeness: 'partial',
        label: 'Import estructurado core',
        includes: expect.arrayContaining(['entities', 'momentos', 'notes', 'tasks']),
        excludes: expect.arrayContaining([
          'netlify_blobs_binary',
          'oauth_tokens',
          'chat_messages',
        ]),
        warnings: expect.arrayContaining([
          'Importa solo el backup estructurado core; no restaura blobs, tokens ni logs.',
        ]),
      },
    })
  })

  it('importa payload v2 con momentos, links, notas y tareas usando el usuario actual', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ id: 'legacy-single-user:e1' }]) // entity
    mockSqlResponses.push([{ id: 'legacy-single-user:q1' }]) // quote
    mockSqlResponses.push([{ id: 'legacy-single-user:m1' }]) // momento
    mockSqlResponses.push([{ momento_id: 'legacy-single-user:m1' }]) // link
    mockSqlResponses.push([{ id: 'legacy-single-user:n1' }]) // note
    mockSqlResponses.push([{ id: 'legacy-single-user:t1' }]) // task

    const res = await handler(
      new Request('http://localhost/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 2,
          entities: [{ id: 'e1', type: 'persona', name: 'Ada' }],
          quotes: [
            {
              id: 'q1',
              entityId: 'e1',
              text: 'La cita',
              linkedQuoteIds: ['q2'],
            },
          ],
          momentos: [
            {
              id: 'm1',
              kind: 'foto',
              capturedAt: '2026-05-07T00:00:00.000Z',
              payload: { items: [{ storageKey: 'legacy-single-user/foto.png' }] },
              note: 'foto',
              origin: { kind: 'manual' },
              entityIds: ['e1'],
            },
          ],
          notes: [
            {
              id: 'n1',
              content: 'nota #tag',
              tags: ['tag'],
              pinned: true,
              promotedMomentoId: 'm1',
              origin: { kind: 'manual' },
            },
          ],
          tasks: [
            {
              id: 't1',
              title: 'hacer backup',
              detail: null,
              done: false,
              dueDate: '2026-06-02',
              completedAt: null,
              tags: ['ops'],
              origin: { kind: 'manual' },
            },
          ],
        }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      imported: 6,
      skipped: 0,
      failed: [],
      scope: { kind: 'structured-core', completeness: 'partial' },
    })
    const templates = mockSqlState.calls.map((c) => c.template).join('\n')
    expect(templates).toMatch(/INSERT INTO momentos/)
    expect(templates).toMatch(/INSERT INTO momento_entities/)
    expect(templates).toMatch(/INSERT INTO notes/)
    expect(templates).toMatch(/INSERT INTO tasks/)
    const quoteInsert = mockSqlState.calls.find((c) =>
      /INSERT INTO quotes/i.test(c.template),
    )
    expect(quoteInsert?.values).toContainEqual(['legacy-single-user:q2'])
    for (const call of mockSqlState.calls) {
      if (
        /INSERT INTO (entities|quotes|momentos|momento_entities|notes|tasks)/i.test(
          call.template,
        )
      ) {
        expect(call.values).toContain('legacy-single-user')
      }
    }
  })
})
