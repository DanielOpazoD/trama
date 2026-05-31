/**
 * EE: integration tests del endpoint /api/momentos-merge.
 *
 * Cubre los contratos centrales:
 *   - 400 si faltan inputs
 *   - 404 si algún id no existe en la BD
 *   - 400 si algún id es de kind ≠ 'foto'
 *   - 200 con primary actualizado + items combinados + others soft-delete
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
// embedSafe vive en ./embeddings.js; mock para que no intente OpenAI.
vi.mock('./embeddings.js', () => ({
  embedSafe: vi.fn().mockResolvedValue(null),
  toPgVector: (v: number[]) => `[${v.join(',')}]`,
}))

import handler from '../momentos-merge'

describe('momentos-merge endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('405 a métodos != POST', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos-merge', { method: 'GET' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  // UUIDs válidos para tests que llegan a la fase de SQL.
  const UUID_A = '11111111-1111-1111-1111-111111111111'
  const UUID_B = '22222222-2222-2222-2222-222222222222'

  it('400 sin primaryId', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos-merge', {
        method: 'POST',
        body: JSON.stringify({ otherIds: [UUID_A] }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/primaryId/i)
  })

  it('400 con otherIds vacío', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos-merge', {
        method: 'POST',
        body: JSON.stringify({ primaryId: UUID_A, otherIds: [] }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/al menos 1/i)
  })

  it('400 si primaryId está en otherIds (auto-merge)', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos-merge', {
        method: 'POST',
        body: JSON.stringify({ primaryId: UUID_A, otherIds: [UUID_A] }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/no puede estar/i)
  })

  // EE-followup #5: validación UUID en código.
  it('400 si primaryId no es un UUID válido', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos-merge', {
        method: 'POST',
        body: JSON.stringify({ primaryId: 'not-a-uuid', otherIds: [UUID_A] }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/UUID válido/)
  })

  it('400 si algún otherId no es un UUID válido', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos-merge', {
        method: 'POST',
        body: JSON.stringify({ primaryId: UUID_A, otherIds: ['bad-id'] }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/UUID inválido/)
  })

  it('400 si otherIds > 50 elementos', async () => {
    const tooMany = Array.from(
      { length: 51 },
      (_, i) => `${String(i).padStart(8, '0')}-1111-1111-1111-111111111111`,
    )
    const res = await handler(
      new Request('http://localhost/api/momentos-merge', {
        method: 'POST',
        body: JSON.stringify({ primaryId: UUID_A, otherIds: tooMany }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/máximo 50/)
  })

  it('404 si algún id no está en la BD', async () => {
    // Primer SELECT: solo devuelve el primary, falta el other.
    mockSqlResponses.push([
      {
        id: '11111111-1111-1111-1111-111111111111',
        kind: 'foto',
        captured_at: '2026-05-25T10:00:00Z',
        payload: { items: [{ storageKey: 'a.jpg' }] },
        note: null,
      },
    ])
    const res = await handler(
      new Request('http://localhost/api/momentos-merge', {
        method: 'POST',
        body: JSON.stringify({
          primaryId: '11111111-1111-1111-1111-111111111111',
          otherIds: ['22222222-2222-2222-2222-222222222222'],
        }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(404)
    expect(await res.text()).toMatch(/no encontrado/i)
  })

  it('400 si algún momento es de kind ≠ foto', async () => {
    mockSqlResponses.push([
      {
        id: '11111111-1111-1111-1111-111111111111',
        kind: 'foto',
        captured_at: '2026-05-25T10:00:00Z',
        payload: { items: [{ storageKey: 'a.jpg' }] },
        note: null,
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        kind: 'nota', // ← el problema
        captured_at: '2026-05-25T11:00:00Z',
        payload: { bodyText: 'una nota' },
        note: null,
      },
    ])
    const res = await handler(
      new Request('http://localhost/api/momentos-merge', {
        method: 'POST',
        body: JSON.stringify({
          primaryId: '11111111-1111-1111-1111-111111111111',
          otherIds: ['22222222-2222-2222-2222-222222222222'],
        }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/kind='foto'/)
  })

  it('200 fusiona items[] y soft-deletea los others', async () => {
    // SELECT inicial — primary + 2 others, todos foto.
    mockSqlResponses.push([
      {
        id: '11111111-1111-1111-1111-111111111111',
        kind: 'foto',
        captured_at: '2026-05-22T10:00:00Z',
        payload: { items: [{ storageKey: 'a.jpg', width: 100, height: 100 }] },
        note: 'cumpleaños',
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        kind: 'foto',
        captured_at: '2026-05-25T11:00:00Z',
        payload: { items: [{ storageKey: 'b.jpg' }] },
        note: null,
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        kind: 'foto',
        captured_at: '2026-05-25T12:00:00Z',
        payload: { storageKey: 'c.jpg' }, // formato legacy
        note: null,
      },
    ])
    mockSqlResponses.push([]) // ensureUserRow
    // CTE atómico (EE-followup #4): un solo query que combina UPDATE
    // primary + INSERT links + soft-delete others. Devuelve { primary,
    // deleted_others, links_inserted }.
    mockSqlResponses.push([
      {
        primary: {
          id: '11111111-1111-1111-1111-111111111111',
          kind: 'foto',
          captured_at: '2026-05-22T10:00:00Z',
          payload: {
            items: [
              { storageKey: 'a.jpg', width: 100, height: 100 },
              { storageKey: 'b.jpg' },
              { storageKey: 'c.jpg' },
            ],
          },
          note: 'Cumpleaños de Ana',
        },
        deleted_others: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            deletedAt: '2026-05-25T13:00:00Z',
          },
          {
            id: '33333333-3333-3333-3333-333333333333',
            deletedAt: '2026-05-25T13:00:00Z',
          },
        ],
        links_inserted: 0,
      },
    ])
    // SELECT final del primary actualizado.
    mockSqlResponses.push([
      {
        id: '11111111-1111-1111-1111-111111111111',
        kind: 'foto',
        captured_at: '2026-05-22T10:00:00Z',
        payload: {
          items: [
            { storageKey: 'a.jpg', width: 100, height: 100 },
            { storageKey: 'b.jpg' },
            { storageKey: 'c.jpg' },
          ],
          storageKey: 'a.jpg',
          width: 100,
          height: 100,
        },
        note: 'cumpleaños',
        origin: { kind: 'manual' },
        created_at: '2026-05-22T10:00:00Z',
        updated_at: '2026-05-25T13:00:00Z',
      },
    ])
    // SELECT entity_ids vinculados.
    mockSqlResponses.push([])

    const res = await handler(
      new Request('http://localhost/api/momentos-merge', {
        method: 'POST',
        body: JSON.stringify({
          primaryId: '11111111-1111-1111-1111-111111111111',
          otherIds: [
            '22222222-2222-2222-2222-222222222222',
            '33333333-3333-3333-3333-333333333333',
          ],
          note: 'Cumpleaños de Ana',
        }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.merged).toBe(2)
    expect(body.itemCount).toBe(3)
    expect(body.payload.items).toHaveLength(3)
    // EE-followup: deletedOthers expone los deletedAt para "deshacer".
    expect(body.deletedOthers).toEqual([
      { id: '22222222-2222-2222-2222-222222222222', deletedAt: '2026-05-25T13:00:00Z' },
      { id: '33333333-3333-3333-3333-333333333333', deletedAt: '2026-05-25T13:00:00Z' },
    ])

    // Verificar que el CTE atómico se hizo (un solo query con todas las
    // operaciones de escritura).
    const cte = mockSqlState.calls.find(
      (c) =>
        c.template.includes('WITH update_primary') &&
        c.template.includes('soft_delete_others'),
    )
    expect(cte).toBeDefined()
  })

  it('dedupea items[] por storageKey (no agrega duplicados)', async () => {
    // Caso: primary tiene a.jpg, other también tiene a.jpg + b.jpg.
    // Resultado esperado: items = [a, b] (no [a, a, b]).
    mockSqlResponses.push([
      {
        id: '11111111-1111-1111-1111-111111111111',
        kind: 'foto',
        captured_at: '2026-05-22T10:00:00Z',
        payload: { items: [{ storageKey: 'a.jpg' }] },
        note: null,
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        kind: 'foto',
        captured_at: '2026-05-23T10:00:00Z',
        payload: { items: [{ storageKey: 'a.jpg' }, { storageKey: 'b.jpg' }] },
        note: null,
      },
    ])
    mockSqlResponses.push([]) // ensureUserRow
    // CTE atómico devuelve {primary, deleted_others, links_inserted}.
    mockSqlResponses.push([
      {
        primary: {
          id: '11111111-1111-1111-1111-111111111111',
          kind: 'foto',
          captured_at: '2026-05-22T10:00:00Z',
          payload: { items: [{ storageKey: 'a.jpg' }, { storageKey: 'b.jpg' }] },
          note: null,
        },
        deleted_others: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            deletedAt: '2026-05-25T13:00:00Z',
          },
        ],
        links_inserted: 0,
      },
    ])
    mockSqlResponses.push([
      {
        id: '11111111-1111-1111-1111-111111111111',
        kind: 'foto',
        captured_at: '2026-05-22T10:00:00Z',
        payload: { items: [{ storageKey: 'a.jpg' }, { storageKey: 'b.jpg' }] },
        note: null,
        origin: { kind: 'manual' },
        created_at: '',
        updated_at: '',
      },
    ])
    mockSqlResponses.push([])

    const res = await handler(
      new Request('http://localhost/api/momentos-merge', {
        method: 'POST',
        body: JSON.stringify({
          primaryId: '11111111-1111-1111-1111-111111111111',
          otherIds: ['22222222-2222-2222-2222-222222222222'],
        }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    // Items deduplicadas: solo 2 (a + b), no 3.
    expect(body.itemCount).toBe(2)
  })

  it('fusiona payload photos legado sin perder fotos ni portada primaria', async () => {
    mockSqlResponses.push([
      {
        id: '11111111-1111-1111-1111-111111111111',
        kind: 'foto',
        captured_at: '2026-05-22T10:00:00Z',
        payload: {
          photos: [
            { storageKey: 'primary-secondary.jpg' },
            { storageKey: 'primary.jpg' },
          ],
          primaryStorageKey: 'primary.jpg',
        },
        note: null,
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        kind: 'foto',
        captured_at: '2026-05-23T10:00:00Z',
        payload: {
          photos: [{ storageKey: 'other.jpg' }, { storageKey: 'primary.jpg' }],
        },
        note: null,
      },
    ])
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([
      {
        primary: {
          id: '11111111-1111-1111-1111-111111111111',
          kind: 'foto',
          captured_at: '2026-05-22T10:00:00Z',
          payload: {
            items: [
              { storageKey: 'primary.jpg' },
              { storageKey: 'primary-secondary.jpg' },
              { storageKey: 'other.jpg' },
            ],
          },
          note: null,
        },
        deleted_others: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            deletedAt: '2026-05-25T13:00:00Z',
          },
        ],
        links_inserted: 0,
      },
    ])
    mockSqlResponses.push([
      {
        id: '11111111-1111-1111-1111-111111111111',
        kind: 'foto',
        captured_at: '2026-05-22T10:00:00Z',
        payload: {
          items: [
            { storageKey: 'primary.jpg' },
            { storageKey: 'primary-secondary.jpg' },
            { storageKey: 'other.jpg' },
          ],
        },
        note: null,
        origin: { kind: 'manual' },
        created_at: '',
        updated_at: '',
      },
    ])
    mockSqlResponses.push([])

    const res = await handler(
      new Request('http://localhost/api/momentos-merge', {
        method: 'POST',
        body: JSON.stringify({
          primaryId: '11111111-1111-1111-1111-111111111111',
          otherIds: ['22222222-2222-2222-2222-222222222222'],
        }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.itemCount).toBe(3)
    const cte = mockSqlState.calls.find((c) => c.template.includes('WITH update_primary'))
    expect(JSON.parse(String(cte?.values[0]))).toMatchObject({
      items: [
        { storageKey: 'primary.jpg' },
        { storageKey: 'primary-secondary.jpg' },
        { storageKey: 'other.jpg' },
      ],
      storageKey: 'primary.jpg',
    })
  })
})
