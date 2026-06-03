import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../entities-merge'

// UUIDs válidos (versión 4, variant 8) — Zod .uuid() es estricto con esos bits.
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

function post(body: unknown) {
  return new Request('http://localhost/api/entities-merge', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('entities-merge endpoint', () => {
  beforeEach(() => mockSqlResponses.reset())
  afterEach(() => vi.unstubAllGlobals())

  it('método no POST devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/entities-merge'),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  it('400 si keepId es inválido (Zod)', async () => {
    const res = await handler(post({ keepId: 'no-uuid', mergeIds: [B] }), mockContext())
    expect(res.status).toBe(400)
  })

  it('400 si mergeIds queda vacío tras quitar keepId', async () => {
    const res = await handler(post({ keepId: A, mergeIds: [A] }), mockContext())
    expect(res.status).toBe(400)
  })

  it('404 si alguna entidad no existe / no es del usuario', async () => {
    mockSqlResponses.push([{ id: A }]) // SELECT found: solo 1 de 2 ids
    const res = await handler(post({ keepId: A, mergeIds: [B] }), mockContext())
    expect(res.status).toBe(404)
    // No debe haber reasignado nada.
    expect(
      mockSqlResponses.calls.some((c) => /UPDATE quotes SET entity_id/i.test(c.template)),
    ).toBe(false)
  })

  it('reasigna citas/relaciones/momentos y soft-deletea el duplicado en UN solo CTE', async () => {
    // FIFO: SELECT found (2), ensureUserRow, y el CTE atómico que devuelve la keep.
    mockSqlResponses.push(
      [{ id: A }, { id: B }], // 1) SELECT found
      [], // 2) ensureUserRow
      [{ id: A, type: 'escritor', name: 'Borges', origin: { kind: 'manual' } }], // 3) CTE → keep
    )
    const res = await handler(post({ keepId: A, mergeIds: [B] }), mockContext())
    expect(res.status).toBe(200)

    // Todas las mutaciones viajan en UN solo statement CTE (atomicidad real).
    const cte = mockSqlResponses.calls.find((c) =>
      /WITH reassign_quotes/i.test(c.template),
    )
    expect(cte).toBeDefined()
    const t = cte!.template
    expect(t).toMatch(/UPDATE quotes SET entity_id/i)
    expect(t).toMatch(/INSERT INTO momento_entities/i)
    // Reasigna ambos extremos y limpia self-loops en un único UPDATE con CASE.
    expect(t).toMatch(/UPDATE relationships r SET/i)
    expect(t).toMatch(/deleted_at = CASE/i)
    // El borrado de self-loops está acotado a las relaciones tocadas por el merge.
    expect(t).toMatch(/from_id = ANY\([^)]*\) OR .*to_id = ANY/i)
    // Soft-delete del duplicado, nunca hard-delete.
    expect(t).toMatch(/UPDATE entities SET deleted_at = NOW\(\)/i)
    expect(
      mockSqlResponses.calls.some((c) => /DELETE FROM entities/i.test(c.template)),
    ).toBe(false)
  })
})
