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

  it('400 sin primaryId', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos-merge', {
        method: 'POST',
        body: JSON.stringify({ otherIds: ['a'] }),
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
        body: JSON.stringify({ primaryId: 'p', otherIds: [] }),
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
        body: JSON.stringify({ primaryId: 'p', otherIds: ['p'] }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/no puede estar/i)
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
    // UPDATE primary, INSERT entity_links: vacíos.
    mockSqlResponses.push([])
    mockSqlResponses.push([])
    // UPDATE soft-delete others ahora devuelve [{id, deleted_at}] (EE-followup).
    mockSqlResponses.push([
      { id: '22222222-2222-2222-2222-222222222222', deleted_at: '2026-05-25T13:00:00Z' },
      { id: '33333333-3333-3333-3333-333333333333', deleted_at: '2026-05-25T13:00:00Z' },
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

    // Verificar que las queries críticas se hicieron:
    // - UPDATE primary con payload nuevo (incluye los 3 items)
    const updatePrimary = mockSqlState.calls.find((c) =>
      c.template.includes('UPDATE momentos') && c.template.includes('payload =')
    )
    expect(updatePrimary).toBeDefined()
    // - UPDATE de soft-delete sobre los otherIds.
    const softDelete = mockSqlState.calls.find((c) =>
      c.template.includes('SET deleted_at = NOW()'),
    )
    expect(softDelete).toBeDefined()
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
    // UPDATE primary + INSERT links: vacíos.
    mockSqlResponses.push([], [])
    // UPDATE soft-delete others (EE-followup): devuelve la fila borrada.
    mockSqlResponses.push([
      { id: '22222222-2222-2222-2222-222222222222', deleted_at: '2026-05-25T13:00:00Z' },
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
})
