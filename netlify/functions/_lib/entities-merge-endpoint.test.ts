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

  it('reasigna citas/relaciones/momentos y soft-deletea el duplicado', async () => {
    // FIFO en orden: SELECT found (2), luego 7 mutaciones, luego SELECT keep.
    mockSqlResponses.push(
      [{ id: A }, { id: B }], // 1) SELECT found
      [], // 2) UPDATE quotes
      [], // 3) INSERT momento_entities
      [], // 4) DELETE momento_entities
      [], // 5) UPDATE relationships from_id
      [], // 6) UPDATE relationships to_id
      [], // 7) UPDATE self-loops
      [], // 8) UPDATE entities soft-delete
      [{ id: A, type: 'escritor', name: 'Borges', origin: { kind: 'manual' } }], // 9) SELECT keep
    )
    const res = await handler(post({ keepId: A, mergeIds: [B] }), mockContext())
    expect(res.status).toBe(200)

    const tpl = mockSqlResponses.calls.map((c) => c.template)
    // Reasignaciones al keep.
    expect(tpl.some((t) => /UPDATE quotes SET entity_id/i.test(t))).toBe(true)
    expect(tpl.some((t) => /INSERT INTO momento_entities/i.test(t))).toBe(true)
    expect(tpl.some((t) => /UPDATE relationships SET from_id/i.test(t))).toBe(true)
    expect(tpl.some((t) => /UPDATE relationships SET to_id/i.test(t))).toBe(true)
    // Soft-delete del duplicado, nunca hard-delete.
    expect(tpl.some((t) => /UPDATE entities\s+SET deleted_at = NOW\(\)/i.test(t))).toBe(
      true,
    )
    expect(tpl.some((t) => /DELETE FROM entities/i.test(t))).toBe(false)
  })
})
