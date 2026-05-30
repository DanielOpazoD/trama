import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../wikipedia-suggest'

/**
 * /api/wikipedia-suggest — para cada entidad sin wikipedia_url propone el mejor
 * artículo. Cubre: método inválido, el match por entidad, que una falla puntual
 * de Wikipedia no frena el lote, y el flag `remaining`.
 */
describe('wikipedia-suggest endpoint', () => {
  beforeEach(() => mockSqlResponses.reset())
  afterEach(() => vi.unstubAllGlobals())

  it('método no GET devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/wikipedia-suggest', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  it('propone el primer match de Wikipedia por entidad', async () => {
    mockSqlResponses.push([{ id: 'a', name: 'Borges', type: 'escritor' }])
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        pages: [
          {
            key: 'Jorge_Luis_Borges',
            title: 'Jorge Luis Borges',
            description: 'escritor argentino',
          },
          { key: 'Otro', title: 'Otro', description: null },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await handler(
      new Request('http://localhost/api/wikipedia-suggest'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.remaining).toBe(false)
    expect(body.suggestions).toEqual([
      {
        entityId: 'a',
        entityName: 'Borges',
        entityType: 'escritor',
        match: {
          title: 'Jorge Luis Borges',
          url: 'https://es.wikipedia.org/wiki/Jorge_Luis_Borges',
          description: 'escritor argentino',
        },
      },
    ])
  })

  it('una falla de Wikipedia deja la entidad sin sugerencia (match null)', async () => {
    mockSqlResponses.push([{ id: 'a', name: 'X', type: 'concepto' }])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    )
    const res = await handler(
      new Request('http://localhost/api/wikipedia-suggest'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions).toHaveLength(1)
    expect(body.suggestions[0].match).toBeNull()
  })

  it('marca remaining=true cuando hay más entidades que el lote', async () => {
    // BATCH = 25 → el handler pide LIMIT 26; 26 filas ⇒ quedan más.
    const rows = Array.from({ length: 26 }, (_, i) => ({
      id: `e${i}`,
      name: `Entidad ${i}`,
      type: 'concepto',
    }))
    mockSqlResponses.push(rows)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ pages: [] }),
      })),
    )
    const res = await handler(
      new Request('http://localhost/api/wikipedia-suggest'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.remaining).toBe(true)
    expect(body.suggestions).toHaveLength(25)
  })
})
