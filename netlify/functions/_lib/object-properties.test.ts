import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
vi.mock('./auth.js', () => ({
  getAuthedUser: vi.fn().mockResolvedValue({ id: 'u1' }),
}))

import objectPropertiesHandler from '../object-properties'
import { buildPropertiesUpdate } from './object-properties'

const ID = '11111111-1111-4111-8111-111111111111'

describe('buildPropertiesUpdate', () => {
  it('set + unset + tags en un UPDATE parametrizado', () => {
    const b = buildPropertiesUpdate({
      kind: 'entity',
      id: ID,
      setProps: { team: 'marketing' },
      unsetProps: ['old'],
      setTags: ['a', 'b'],
    })
    const text = b.toText()
    expect(text).toContain('UPDATE entities SET')
    expect(text).toContain('properties = (properties - $1::text[]) || $2::jsonb')
    expect(text).toContain('tags = $3::text[]')
    expect(text).toContain('updated_at = NOW()')
    expect(text).toContain('WHERE id = $4::uuid AND deleted_at IS NULL RETURNING id')
    expect(b.values[0]).toEqual(['old'])
    expect(b.values[1]).toBe(JSON.stringify({ team: 'marketing' }))
    expect(b.values[2]).toEqual(['a', 'b'])
  })

  it('sólo setTags no toca properties', () => {
    const text = buildPropertiesUpdate({ kind: 'note', id: ID, setTags: [] }).toText()
    expect(text).toContain('tags = $1::text[]')
    expect(text).not.toContain('properties =')
  })

  it('sólo unset usa el operador - sin ||', () => {
    const text = buildPropertiesUpdate({
      kind: 'note',
      id: ID,
      unsetProps: ['x'],
    }).toText()
    expect(text).toContain('properties = (properties - $1::text[])')
    expect(text).not.toContain('|| ')
  })
})

function patch(body: unknown): Request {
  return new Request('http://localhost/api/object-properties', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('object-properties endpoint', () => {
  beforeEach(() => mockSqlResponses.reset())

  it('PATCH actualiza y devuelve id', async () => {
    mockSqlResponses.push([{ id: ID }])
    const res = await objectPropertiesHandler(
      patch({ kind: 'entity', id: ID, setProps: { team: 'marketing' } }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: ID })
  })

  it('objeto inexistente → 404', async () => {
    mockSqlResponses.push([]) // UPDATE … RETURNING vacío
    const res = await objectPropertiesHandler(
      patch({ kind: 'entity', id: ID, setTags: ['x'] }),
      mockContext(),
    )
    expect(res.status).toBe(404)
  })

  it('body sin cambios → 400', async () => {
    const res = await objectPropertiesHandler(
      patch({ kind: 'entity', id: ID }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('clave de propiedad inválida → 400', async () => {
    const res = await objectPropertiesHandler(
      patch({ kind: 'entity', id: ID, setProps: { 'bad key!': 'x' } }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('GET no permitido → 405', async () => {
    const res = await objectPropertiesHandler(
      new Request('http://localhost/api/object-properties'),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })
})
