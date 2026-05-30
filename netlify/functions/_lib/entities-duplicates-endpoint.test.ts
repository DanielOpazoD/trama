import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../entities-duplicates'

describe('entities-duplicates endpoint', () => {
  beforeEach(() => mockSqlResponses.reset())
  afterEach(() => vi.unstubAllGlobals())

  it('método no GET devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/entities-duplicates', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  it('agrupa por nombre normalizado (tildes/mayúsculas)', async () => {
    mockSqlResponses.push(
      [
        { id: 'a', name: 'Borges', type: 'escritor' },
        { id: 'b', name: 'bórges', type: 'escritor' },
        { id: 'c', name: 'Cortázar', type: 'escritor' },
      ], // SELECT entidades
      [], // self-join embeddings (sin pares)
    )
    const res = await handler(
      new Request('http://localhost/api/entities-duplicates'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.groups).toHaveLength(1)
    expect(body.groups[0].reason).toBe('name')
    expect(body.groups[0].entities.map((e: { id: string }) => e.id).sort()).toEqual([
      'a',
      'b',
    ])
  })

  it('arma un par por similitud de embeddings (nombres distintos)', async () => {
    mockSqlResponses.push(
      [
        { id: 'x', name: 'J. L. Borges', type: 'escritor' },
        { id: 'y', name: 'Jorge Luis Borges', type: 'escritor' },
      ], // SELECT entidades (no agrupan por nombre)
      [{ a_id: 'x', b_id: 'y', sim: 0.95 }], // self-join: par cercano
    )
    const res = await handler(
      new Request('http://localhost/api/entities-duplicates'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.groups).toHaveLength(1)
    expect(body.groups[0].reason).toBe('similar')
    expect(body.groups[0].similarity).toBeCloseTo(0.95, 2)
    expect(body.groups[0].entities.map((e: { id: string }) => e.id).sort()).toEqual([
      'x',
      'y',
    ])
  })
})
