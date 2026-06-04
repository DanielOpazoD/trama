import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../prompts'

const PROMPT_ROW = {
  id: 'p1',
  title: 'Sintetizar',
  content: 'Resume {{tema}} con #claridad',
  collection: 'Investigación',
  tags: ['claridad'],
  variables: ['tema'],
  favorite: false,
  use_count: 2,
  last_used_at: null,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
}

describe('prompts endpoint — integration', () => {
  beforeEach(() => mockSqlResponses.reset())
  afterEach(() => vi.unstubAllGlobals())

  it('GET lista prompts del usuario y excluye soft-deleted', async () => {
    mockSqlResponses.push([PROMPT_ROW])

    const res = await handler(new Request('http://localhost/api/prompts'), mockContext())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([PROMPT_ROW])
    const query = mockSqlResponses.calls.find((c) => /FROM prompts/i.test(c.template))
    expect(query?.template).toMatch(/deleted_at IS NULL/i)
    expect(query?.template).toMatch(/user_id =/i)
  })

  it('GET ?q busca en título o contenido', async () => {
    mockSqlResponses.push([PROMPT_ROW])

    const res = await handler(
      new Request('http://localhost/api/prompts?q=tema'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const query = mockSqlResponses.calls.find((c) => /ILIKE/i.test(c.template))
    expect(query?.template).toMatch(/title ILIKE/i)
    expect(query?.template).toMatch(/content ILIKE/i)
    expect(query?.values).toContain('%tema%')
  })

  it('GET ?collection y ?tag filtran por colección o tag', async () => {
    mockSqlResponses.push([PROMPT_ROW], [PROMPT_ROW])

    const byCollection = await handler(
      new Request('http://localhost/api/prompts?collection=Investigación'),
      mockContext(),
    )
    const byTag = await handler(
      new Request('http://localhost/api/prompts?tag=Claridad'),
      mockContext(),
    )

    expect(byCollection.status).toBe(200)
    expect(byTag.status).toBe(200)
    expect(mockSqlResponses.calls[0]?.template).toMatch(/collection =/i)
    expect(mockSqlResponses.calls[1]?.template).toMatch(/ANY\(tags\)/i)
    expect(mockSqlResponses.calls[1]?.values).toContain('claridad')
  })

  it('POST crea prompt, deriva tags y variables', async () => {
    mockSqlResponses.push(
      [], // ensureUserRow
      [PROMPT_ROW],
    )

    const res = await handler(
      new Request('http://localhost/api/prompts', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Sintetizar',
          content: 'Resume {{tema}} con #claridad',
          collection: 'Investigación',
          favorite: true,
        }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(201)
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO prompts/i.test(c.template),
    )
    expect(insert?.values).toContainEqual(['claridad'])
    expect(insert?.values).toContainEqual(['tema'])
    expect(insert?.values).toContain(true)
  })

  it('POST inválido devuelve 400 antes de escribir', async () => {
    const res = await handler(
      new Request('http://localhost/api/prompts', {
        method: 'POST',
        body: JSON.stringify({ title: '', content: '' }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(400)
    expect(
      mockSqlResponses.calls.some((c) => /INSERT INTO prompts/i.test(c.template)),
    ).toBe(false)
  })

  it('PATCH recalcula tags y variables cuando cambia contenido', async () => {
    mockSqlResponses.push(
      [
        {
          title: 'Viejo',
          content: 'Texto viejo',
          collection: 'Archivo',
        },
      ],
      [{ ...PROMPT_ROW, content: 'Nuevo {{foco}} #memoria' }],
    )

    const res = await handler(
      new Request('http://localhost/api/prompts/p1', {
        method: 'PATCH',
        body: JSON.stringify({ content: 'Nuevo {{foco}} #memoria', collection: null }),
      }),
      mockContext({ id: 'p1' }),
    )

    expect(res.status).toBe(200)
    const update = mockSqlResponses.calls.find((c) => /UPDATE prompts/i.test(c.template))
    expect(update?.values).toContainEqual(['memoria'])
    expect(update?.values).toContainEqual(['foco'])
  })

  it('PATCH inexistente devuelve 404', async () => {
    mockSqlResponses.push([])

    const res = await handler(
      new Request('http://localhost/api/prompts/nope', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Nuevo' }),
      }),
      mockContext({ id: 'nope' }),
    )

    expect(res.status).toBe(404)
  })

  it('duplicate copia el prompt para el mismo usuario', async () => {
    mockSqlResponses.push(
      [], // ensureUserRow
      [{ ...PROMPT_ROW, id: 'p2', title: 'Sintetizar copia', favorite: false }],
    )

    const res = await handler(
      new Request('http://localhost/api/prompts/p1/duplicate', { method: 'POST' }),
      mockContext({ id: 'p1' }),
    )

    expect(res.status).toBe(201)
    const duplicate = mockSqlResponses.calls.find((c) =>
      /SELECT title \|\| ' copia'/i.test(c.template),
    )
    expect(duplicate?.template).toMatch(/user_id =/i)
  })

  it('use incrementa contador y actualiza last_used_at', async () => {
    mockSqlResponses.push([{ ...PROMPT_ROW, use_count: 3 }])

    const res = await handler(
      new Request('http://localhost/api/prompts/p1/use', { method: 'POST' }),
      mockContext({ id: 'p1' }),
    )

    expect(res.status).toBe(200)
    const update = mockSqlResponses.calls.find((c) =>
      /use_count = use_count \+ 1/i.test(c.template),
    )
    expect(update?.template).toMatch(/last_used_at = NOW\(\)/i)
  })

  it('DELETE hace soft-delete del prompt y sus anexos', async () => {
    const res = await handler(
      new Request('http://localhost/api/prompts/p1', { method: 'DELETE' }),
      mockContext({ id: 'p1' }),
    )

    expect(res.status).toBe(200)
    expect(
      mockSqlResponses.calls.some((c) => /DELETE FROM prompts/i.test(c.template)),
    ).toBe(false)
    expect(mockSqlResponses.calls[0]?.template).toMatch(/UPDATE prompts SET deleted_at/i)
    expect(mockSqlResponses.calls[1]?.template).toMatch(/UPDATE notas_attachments/i)
    expect(mockSqlResponses.calls[1]?.template).toMatch(/owner_type = 'prompt'/i)
  })

  it('método no soportado devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/prompts', { method: 'PUT' }),
      mockContext(),
    )

    expect(res.status).toBe(405)
  })
})
