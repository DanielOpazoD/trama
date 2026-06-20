import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  expectCanonicalError,
  mockContext,
  mockSqlResponses,
  setupMockSql,
} from './test-utils'

vi.mock('./db.js', () => setupMockSql())
const embeddingMocks = vi.hoisted(() => ({
  embedSafe: vi.fn(),
  toPgVector: vi.fn((vector: number[]) => `[${vector.join(',')}]`),
}))
vi.mock('./embeddings.js', () => embeddingMocks)
// Cualquier fetch externo queda stubbeado; embeddings se controlan con el mock
// explícito de embedSafe para poder testear si el endpoint pide re-embed.
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: async () => '',
    json: async () => ({}),
  }),
)

import handler from '../momentos'

describe('momentos endpoint — integration (mock SQL)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockSqlResponses.reset()
    embeddingMocks.embedSafe.mockReset()
    embeddingMocks.embedSafe.mockResolvedValue(null)
    embeddingMocks.toPgVector.mockClear()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    consoleLogSpy.mockRestore()
    vi.unstubAllGlobals()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => '',
        json: async () => ({}),
      }),
    )
  })

  it('GET list devuelve items + nextCursor null cuando no hay más páginas', async () => {
    mockSqlResponses.push([
      {
        id: 'm1',
        kind: 'nota',
        captured_at: '2026-05-24T12:00:00Z',
        payload: { bodyText: 'hola' },
        note: null,
        origin: { kind: 'manual' },
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
      },
    ])
    // Bulk-fetch de links: array vacío (no hay vínculos).
    mockSqlResponses.push([])

    const res = await handler(new Request('http://localhost/api/momentos'), mockContext())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: unknown }
    expect(body.items).toHaveLength(1)
    expect(body.nextCursor).toBeNull()
  })

  it('GET list rechaza cursor duplicado antes de consultar timeline', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos?cursor=a:b&cursor=c:d', {
        headers: { 'x-request-id': 'rid-momentos-query' },
      }),
      mockContext(),
    )

    const body = await expectCanonicalError(res, {
      status: 400,
      code: 'VALIDATION',
      requestId: 'rid-momentos-query',
    })
    expect(body).toMatchObject({
      error: {
        message: 'Query params inválidos',
        details: { issues: [{ path: 'cursor' }] },
      },
    })
    expect(
      mockSqlResponses.calls.some((call) => /\bFROM momentos\b/i.test(call.template)),
    ).toBe(false)
  })

  it('GET list propaga entity_ids del bulk fetch a cada item', async () => {
    mockSqlResponses.push([
      {
        id: 'm1',
        kind: 'recorte',
        captured_at: '2026-05-24T12:00:00Z',
        payload: { title: 'X' },
        note: null,
        origin: { kind: 'manual' },
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
      },
    ])
    mockSqlResponses.push([
      { momento_id: 'm1', entity_id: 'e1' },
      { momento_id: 'm1', entity_id: 'e2' },
    ])
    const res = await handler(new Request('http://localhost/api/momentos'), mockContext())
    const body = (await res.json()) as {
      items: Array<{ entity_ids: string[] }>
    }
    expect(body.items[0].entity_ids).toEqual(['e1', 'e2'])
  })

  it('los reads de links excluyen entidades soft-borradas (P0 auditoría 2026-06)', async () => {
    // GET list: el bulk-fetch de links debe JOINear entities filtrando deleted_at.
    mockSqlResponses.push([
      {
        id: 'm1',
        kind: 'nota',
        captured_at: '2026-05-24T12:00:00Z',
        payload: {},
        note: null,
        origin: { kind: 'manual' },
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
      },
    ])
    mockSqlResponses.push([])
    await handler(new Request('http://localhost/api/momentos'), mockContext())
    const bulkLinks = mockSqlResponses.calls[1]?.template ?? ''
    expect(bulkLinks).toMatch(/JOIN entities e ON e\.id = me\.entity_id/i)
    expect(bulkLinks).toMatch(/e\.deleted_at IS NULL/i)

    // GET :id: misma regla en la query de links del momento individual.
    mockSqlResponses.reset()
    mockSqlResponses.push([
      {
        id: 'm1',
        kind: 'nota',
        captured_at: '2026-05-24T12:00:00Z',
        payload: {},
        note: null,
        origin: { kind: 'manual' },
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
      },
    ])
    mockSqlResponses.push([])
    await handler(
      new Request('http://localhost/api/momentos/m1'),
      mockContext({ id: 'm1' }),
    )
    const oneLinks = mockSqlResponses.calls[1]?.template ?? ''
    expect(oneLinks).toMatch(/JOIN entities e ON e\.id = me\.entity_id/i)
    expect(oneLinks).toMatch(/e\.deleted_at IS NULL/i)
  })

  it('GET list incluye momentos propios y compartidos aceptados', async () => {
    mockSqlResponses.push([])

    await handler(new Request('http://localhost/api/momentos'), mockContext())

    const listQuery = mockSqlResponses.calls[0]?.template ?? ''
    expect(listQuery).toMatch(/LEFT JOIN\s+momento_space_access/i)
    expect(listQuery).toMatch(/msa\.owner_user_id = m\.user_id/i)
    expect(listQuery).toMatch(/msa\.member_user_id = \?/i)
    expect(listQuery).toMatch(/\(m\.user_id = \? OR msa\.member_user_id IS NOT NULL\)/i)
    expect(listQuery).toMatch(/owner_display_name/i)
    expect(listQuery).toMatch(/access_role/i)
  })

  it('GET :id devuelve el momento + entity_ids', async () => {
    mockSqlResponses.push([
      {
        id: 'm1',
        kind: 'nota',
        captured_at: '2026-05-24T12:00:00Z',
        payload: {},
        note: 'x',
        origin: { kind: 'manual' },
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
      },
    ])
    mockSqlResponses.push([{ entity_id: 'e1' }])
    const res = await handler(
      new Request('http://localhost/api/momentos/m1'),
      mockContext({ id: 'm1' }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; entity_ids: string[] }
    expect(body.id).toBe('m1')
    expect(body.entity_ids).toEqual(['e1'])
  })

  it('GET :id devuelve 404 si no existe', async () => {
    mockSqlResponses.push([]) // sin resultados
    const res = await handler(
      new Request('http://localhost/api/momentos/nope'),
      mockContext({ id: 'nope' }),
    )
    expect(res.status).toBe(404)
  })

  it('DELETE emite owner.mismatch cuando el id no pertenece al usuario', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([]) // delete no-op
    const res = await handler(
      new Request('http://localhost/api/momentos/m-ajeno', {
        method: 'DELETE',
        headers: { 'x-request-id': 'rid-momento-delete' },
      }),
      mockContext({ id: 'm-ajeno' }),
    )

    await expectCanonicalError(res, {
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'rid-momento-delete',
    })
    const events = consoleLogSpy.mock.calls.map((call) => JSON.parse(call[0] as string))
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'owner.mismatch',
          category: 'operational',
          severity: 'warn',
          requestId: 'rid-momento-delete',
          operation: 'momentos.delete',
          userId: 'legacy-single-user',
        }),
      ]),
    )
  })

  it('POST con kind inválido devuelve 400', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos', {
        method: 'POST',
        body: JSON.stringify({ kind: 'meme', payload: {} }),
        headers: { 'content-type': 'application/json' },
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
    const text = await res.text()
    expect(text).toMatch(/kind/i)
  })

  it('POST con body inválido (no JSON) devuelve 400', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos', {
        method: 'POST',
        body: 'no es json',
        headers: { 'content-type': 'application/json' },
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('POST nota válida devuelve 201 con el row creado', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([
      {
        id: 'new-1',
        kind: 'nota',
        captured_at: '2026-05-24T12:00:00Z',
        payload: { bodyText: 'una nota' },
        note: null,
        origin: { kind: 'manual' },
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
      },
    ])
    const res = await handler(
      new Request('http://localhost/api/momentos', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'nota',
          payload: { bodyText: 'una nota' },
        }),
        headers: { 'content-type': 'application/json' },
      }),
      mockContext(),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; entity_ids: string[] }
    expect(body.id).toBe('new-1')
    expect(body.entity_ids).toEqual([])
  })

  it('POST con entity_ids crea momento + links en un solo CTE', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ id: 'e1' }, { id: 'e2' }]) // ownership lookup
    // El CTE (momento + momento_entities) devuelve el row del momento.
    mockSqlResponses.push([
      {
        id: 'new-2',
        kind: 'recorte',
        captured_at: '2026-05-24T12:00:00Z',
        payload: { title: 'X' },
        note: null,
        origin: { kind: 'manual' },
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
      },
    ])
    const res = await handler(
      new Request('http://localhost/api/momentos', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'recorte',
          payload: { title: 'X' },
          entity_ids: ['e1', 'e2'],
        }),
        headers: { 'content-type': 'application/json' },
      }),
      mockContext(),
    )
    expect(res.status).toBe(201)
    // momento + junction viajan en UN solo statement CTE (atomicidad).
    const cte = mockSqlResponses.calls.find((c) => /WITH ins AS/i.test(c.template))
    expect(cte).toBeDefined()
    expect(cte!.template).toMatch(/INSERT INTO momentos/i)
    expect(cte!.template).toMatch(/INSERT INTO momento_entities/i)
  })

  it('DELETE devuelve { deletedAt } si existe', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ id: 'm1', deleted_at: '2026-05-24T13:00:00Z' }])
    const res = await handler(
      new Request('http://localhost/api/momentos/m1', { method: 'DELETE' }),
      mockContext({ id: 'm1' }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { deletedAt: string }
    expect(body.deletedAt).toBe('2026-05-24T13:00:00Z')
  })

  it('DELETE devuelve 404 si no existía (UPDATE returning vacío)', async () => {
    mockSqlResponses.push([])
    const res = await handler(
      new Request('http://localhost/api/momentos/nope', {
        method: 'DELETE',
        headers: { 'x-request-id': 'rid-momento-delete' },
      }),
      mockContext({ id: 'nope' }),
    )
    await expectCanonicalError(res, {
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'rid-momento-delete',
    })
  })

  it('PATCH devuelve 404 si el momento no existe', async () => {
    mockSqlResponses.push([]) // lookup vacío
    const res = await handler(
      new Request('http://localhost/api/momentos/x', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'rid-momento-patch',
        },
        body: JSON.stringify({ note: 'cambiada' }),
      }),
      mockContext({ id: 'x' }),
    )
    await expectCanonicalError(res, {
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'rid-momento-patch',
    })
  })

  it('PATCH permite editar un momento compartido cuando el rol es editor', async () => {
    mockSqlResponses.push([]) // set_config app.rls_bypass para lookup
    mockSqlResponses.push([
      {
        kind: 'nota',
        payload: { bodyText: 'original' },
        note: null,
        user_id: 'owner-user',
        access_role: 'editor',
      },
    ])
    mockSqlResponses.push([]) // set_config app.rls_bypass para update
    mockSqlResponses.push([]) // update
    mockSqlResponses.push([]) // set_config app.rls_bypass para SELECT final
    mockSqlResponses.push([
      {
        id: 'm-shared',
        kind: 'nota',
        captured_at: '2026-05-24T12:00:00Z',
        payload: { bodyText: 'editada' },
        note: null,
        origin: { kind: 'manual' },
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:01:00Z',
        owner_user_id: 'owner-user',
        owner_display_name: 'Mamá',
        owner_email: 'mama@example.com',
        access_role: 'editor',
      },
    ])
    mockSqlResponses.push([]) // set_config app.rls_bypass para links
    mockSqlResponses.push([])

    const res = await handler(
      new Request('http://localhost/api/momentos/m-shared', {
        method: 'PATCH',
        body: JSON.stringify({ payload: { bodyText: 'editada' } }),
        headers: { 'content-type': 'application/json' },
      }),
      mockContext({ id: 'm-shared' }),
    )

    expect(res.status).toBe(200)
    const lookup =
      mockSqlResponses.calls.find((c) =>
        /LEFT JOIN\s+momento_space_access/i.test(c.template),
      )?.template ?? ''
    expect(lookup).toMatch(/LEFT JOIN\s+momento_space_access/i)
    expect(lookup).toMatch(/msa\.owner_user_id = m\.user_id/i)
    const update = mockSqlResponses.calls.find((c) => /UPDATE momentos/i.test(c.template))
    expect(update?.template).toMatch(/WHERE id = \? AND deleted_at IS NULL/)
  })

  it('PATCH persiste metadata de foto sin recalcular embedding cuando el texto no cambia', async () => {
    mockSqlResponses.push([]) // set_config app.rls_bypass para lookup
    mockSqlResponses.push([
      {
        kind: 'foto',
        payload: {
          storageKey: 'old-key',
          width: 800,
          height: 600,
          caption: 'Playa',
        },
        note: 'vacaciones',
        user_id: 'legacy-single-user',
        access_role: 'owner',
      },
    ])
    mockSqlResponses.push([]) // set_config app.rls_bypass para update
    mockSqlResponses.push([]) // update
    mockSqlResponses.push([]) // set_config app.rls_bypass para SELECT final
    mockSqlResponses.push([
      {
        id: 'm-foto',
        kind: 'foto',
        captured_at: '2026-05-24T12:00:00Z',
        payload: {
          storageKey: 'new-key',
          width: 1200,
          height: 900,
          caption: 'Playa',
        },
        note: 'vacaciones',
        origin: { kind: 'manual' },
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:01:00Z',
        owner_user_id: 'legacy-single-user',
        access_role: 'owner',
      },
    ])
    mockSqlResponses.push([]) // set_config app.rls_bypass para links
    mockSqlResponses.push([])

    const res = await handler(
      new Request('http://localhost/api/momentos/m-foto', {
        method: 'PATCH',
        body: JSON.stringify({
          payload: {
            storageKey: 'new-key',
            width: 1200,
            height: 900,
            caption: 'Playa',
          },
          note: '  vacaciones  ',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      mockContext({ id: 'm-foto' }),
    )

    expect(res.status).toBe(200)
    expect(embeddingMocks.embedSafe).not.toHaveBeenCalled()
    const update = mockSqlResponses.calls.find((c) => /UPDATE momentos/i.test(c.template))
    expect(update?.template).toMatch(/SET payload = CASE/i)
    expect(update?.template).toMatch(/ELSE embedding/i)
  })

  it('PATCH recalcula embedding cuando cambia el texto indexable', async () => {
    embeddingMocks.embedSafe.mockResolvedValue({
      vector: [0.1, 0.2],
      model: 'test-model',
    })
    mockSqlResponses.push([]) // set_config app.rls_bypass para lookup
    mockSqlResponses.push([
      {
        kind: 'nota',
        payload: { bodyText: 'original' },
        note: null,
        user_id: 'legacy-single-user',
        access_role: 'owner',
      },
    ])
    mockSqlResponses.push([]) // set_config app.rls_bypass para update
    mockSqlResponses.push([]) // update
    mockSqlResponses.push([]) // set_config app.rls_bypass para SELECT final
    mockSqlResponses.push([
      {
        id: 'm-nota',
        kind: 'nota',
        captured_at: '2026-05-24T12:00:00Z',
        payload: { bodyText: 'editada' },
        note: null,
        origin: { kind: 'manual' },
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:01:00Z',
        owner_user_id: 'legacy-single-user',
        access_role: 'owner',
      },
    ])
    mockSqlResponses.push([]) // set_config app.rls_bypass para links
    mockSqlResponses.push([])

    const res = await handler(
      new Request('http://localhost/api/momentos/m-nota', {
        method: 'PATCH',
        body: JSON.stringify({ payload: { bodyText: 'editada' } }),
        headers: { 'content-type': 'application/json' },
      }),
      mockContext({ id: 'm-nota' }),
    )

    expect(res.status).toBe(200)
    expect(embeddingMocks.embedSafe).toHaveBeenCalledWith('editada')
  })

  it('métodos no soportados devuelven 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos', { method: 'PUT' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })
})
