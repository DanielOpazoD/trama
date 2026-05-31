import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import countsHandler from '../counts'
import entityTypesHandler from '../entity-types'
import relationshipTypesHandler from '../relationship-types'

describe('counts endpoint', () => {
  beforeEach(() => mockSqlResponses.reset())

  it('devuelve agregados por usuario incluyendo momentos', async () => {
    mockSqlResponses.push([{ c: '2' }], [{ c: '3' }], [{ c: '4' }], [{ c: '5' }])

    const res = await countsHandler(
      new Request('http://localhost/api/counts'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      entities: 2,
      quotes: 3,
      relationships: 4,
      momentos: 5,
    })
    for (const call of mockSqlResponses.calls) {
      expect(call.template).toMatch(/deleted_at IS NULL/)
      expect(call.template).toMatch(/user_id/)
      expect(call.values).toContain('legacy-single-user')
    }
  })

  it('rechaza métodos no GET con ApiErrors', async () => {
    const res = await countsHandler(
      new Request('http://localhost/api/counts', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(405)
    expect(await res.json()).toMatchObject({
      error: { code: 'METHOD_NOT_ALLOWED' },
    })
  })
})

describe('entity-types endpoint', () => {
  beforeEach(() => mockSqlResponses.reset())

  it('lista y upsertea tipos de entidad', async () => {
    mockSqlResponses.push([{ slug: 'persona', label: 'Persona', sort_order: 1 }])

    const get = await entityTypesHandler(
      new Request('http://localhost/api/entity-types'),
      mockContext(),
    )
    expect(await get.json()).toEqual([
      { slug: 'persona', label: 'Persona', sort_order: 1 },
    ])

    mockSqlResponses.reset()
    mockSqlResponses.push([{ slug: 'obra', label: 'Obra', sort_order: 9 }])
    const post = await entityTypesHandler(
      new Request('http://localhost/api/entity-types', {
        method: 'POST',
        body: JSON.stringify({ slug: 'obra', label: 'Obra', sort_order: 9 }),
      }),
      mockContext(),
    )

    expect(post.status).toBe(201)
    expect(await post.json()).toEqual({ slug: 'obra', label: 'Obra', sort_order: 9 })
    expect(mockSqlResponses.calls.at(-1)?.template).toMatch(/ON CONFLICT/)
  })

  it('bloquea delete si el tipo está en uso y borra si no hay uso', async () => {
    mockSqlResponses.push([{ n: '2' }])
    const conflict = await entityTypesHandler(
      new Request('http://localhost/api/entity-types/persona', { method: 'DELETE' }),
      mockContext({ slug: 'persona' }),
    )

    expect(conflict.status).toBe(409)

    mockSqlResponses.reset()
    mockSqlResponses.push([{ n: '0' }], [])
    const deleted = await entityTypesHandler(
      new Request('http://localhost/api/entity-types/persona', { method: 'DELETE' }),
      mockContext({ slug: 'persona' }),
    )

    expect(deleted.status).toBe(204)
    expect(mockSqlResponses.calls.at(-1)?.template).toMatch(/DELETE FROM entity_types/)
  })
})

describe('relationship-types endpoint', () => {
  beforeEach(() => mockSqlResponses.reset())

  it('lista y upsertea tipos de relación', async () => {
    mockSqlResponses.push([
      { slug: 'influye', label: 'Influye', reverse_label: null, sort_order: 1 },
    ])

    const get = await relationshipTypesHandler(
      new Request('http://localhost/api/relationship-types'),
      mockContext(),
    )
    expect(await get.json()).toEqual([
      { slug: 'influye', label: 'Influye', reverse_label: null, sort_order: 1 },
    ])

    mockSqlResponses.reset()
    mockSqlResponses.push([
      { slug: 'lee', label: 'Lee', reverse_label: 'Leído por', sort_order: 7 },
    ])
    const post = await relationshipTypesHandler(
      new Request('http://localhost/api/relationship-types', {
        method: 'POST',
        body: JSON.stringify({
          slug: 'lee',
          label: 'Lee',
          reverse_label: 'Leído por',
          sort_order: 7,
        }),
      }),
      mockContext(),
    )

    expect(post.status).toBe(201)
    expect(await post.json()).toEqual({
      slug: 'lee',
      label: 'Lee',
      reverse_label: 'Leído por',
      sort_order: 7,
    })
  })

  it('protege delete por uso y responde 405 para métodos no soportados', async () => {
    mockSqlResponses.push([{ n: '1' }])
    const conflict = await relationshipTypesHandler(
      new Request('http://localhost/api/relationship-types/lee', { method: 'DELETE' }),
      mockContext({ slug: 'lee' }),
    )

    expect(conflict.status).toBe(409)

    const method = await relationshipTypesHandler(
      new Request('http://localhost/api/relationship-types', { method: 'PATCH' }),
      mockContext(),
    )
    expect(method.status).toBe(405)
  })
})
