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
    // Prompt + anexos caen en el MISMO CTE (mismo deleted_at — restaurable en bloque).
    const cte = mockSqlResponses.calls[0]?.template ?? ''
    expect(cte).toMatch(/UPDATE prompts SET deleted_at/i)
    expect(cte).toMatch(/UPDATE notas_attachments/i)
    expect(cte).toMatch(/owner_type = 'prompt'/i)
    expect(cte).toMatch(/SELECT deleted_at FROM del_prompt/i)
  })

  it('POST /:id/restore revive prompt + anexos con el deleted_at exacto', async () => {
    mockSqlResponses.push([{ restored: true }])
    const res = await handler(
      new Request('http://localhost/api/prompts/p1/restore', {
        method: 'POST',
        body: JSON.stringify({ deletedAt: '2026-06-10T12:00:00Z' }),
      }),
      mockContext({ id: 'p1' }),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).restored).toBe(true)
    const cte = mockSqlResponses.calls[0]?.template ?? ''
    expect(cte).toMatch(/UPDATE prompts SET deleted_at = NULL/i)
    expect(cte).toMatch(/UPDATE notas_attachments SET deleted_at = NULL/i)
  })

  // ---------- historial de versiones ----------

  const TEXTO_ACTUAL = {
    title: 'Sintetizar',
    content: 'Texto viejo',
    collection: 'Archivo',
  }

  it('PATCH que cambia el texto guarda la versión anterior en el MISMO statement', async () => {
    mockSqlResponses.push(
      [TEXTO_ACTUAL], // lectura previa, sólo para derivar tags y variables
      [{ ...PROMPT_ROW, content: 'Texto nuevo', versioned: true }],
      [], // poda
    )

    const res = await handler(
      new Request('http://localhost/api/prompts/p1', {
        method: 'PATCH',
        body: JSON.stringify({ content: 'Texto nuevo' }),
      }),
      mockContext({ id: 'p1' }),
    )

    expect(res.status).toBe(200)
    const escritura = mockSqlResponses.calls.find((c) =>
      /UPDATE prompts/i.test(c.template),
    )
    // Snapshot y escritura comparten statement: no hay instante en el que el
    // texto viejo esté pisado y todavía sin guardar.
    expect(escritura?.template).toMatch(/INSERT INTO prompt_versions/i)
    expect(escritura?.template).toMatch(/WITH snapshot AS/i)
    // Quien decide si hay que versionar es el SQL, comparando la fila viva
    // contra lo que se va a escribir. Si esa comparación desapareciera, la
    // decisión volvería a depender de una lectura previa y una escritura ajena
    // colada en medio se perdería sin registrarse.
    // Sin los comentarios: uno de ellos nombra «IS DISTINCT FROM» y partiría
    // por ahí en vez de por el código.
    const sql = (escritura?.template ?? '').replace(/--[^\n]*/g, '')
    // Acotado al paréntesis de la comparación: sin cortar en RETURNING, el
    // trozo seguiría hasta el SET del UPDATE, que también trae COALESCE(?,
    // title) — y la aserción pasaría por el motivo equivocado.
    const guard = (sql.split('IS DISTINCT FROM')[1] ?? '').split('RETURNING')[0] ?? ''
    expect(sql).toMatch(/IS DISTINCT FROM/i)
    // Y con las MISMAS expresiones que el SET: comparar contra otra cosa
    // reabriría la ventana por el otro lado.
    expect(guard).toMatch(/COALESCE\(\?, title\)/i)
    expect(guard).toMatch(/COALESCE\(\?, content\)/i)
    expect(guard).toMatch(/ELSE collection END/i)
    // La poda corre sólo si la base informa de que registró.
    expect(
      mockSqlResponses.calls.some((c) => /UPDATE prompt_versions/i.test(c.template)),
    ).toBe(true)
  })

  it('un PATCH que no cambia el texto no crea versión', async () => {
    // La base no registró nada porque el texto no cambia: `versioned` false.
    mockSqlResponses.push([TEXTO_ACTUAL], [{ ...PROMPT_ROW, versioned: false }])

    const res = await handler(
      new Request('http://localhost/api/prompts/p1', {
        method: 'PATCH',
        body: JSON.stringify({ title: TEXTO_ACTUAL.title }),
      }),
      mockContext({ id: 'p1' }),
    )

    expect(res.status).toBe(200)
    // Sin snapshot no se poda: la poda sólo tiene sentido tras registrar.
    expect(
      mockSqlResponses.calls.some((c) => /UPDATE prompt_versions/i.test(c.template)),
    ).toBe(false)
  })

  it('marcar favorito no toca el historial ni lee el texto', async () => {
    mockSqlResponses.push([{ ...PROMPT_ROW, favorite: true, versioned: false }])

    const res = await handler(
      new Request('http://localhost/api/prompts/p1', {
        method: 'PATCH',
        body: JSON.stringify({ favorite: true }),
      }),
      mockContext({ id: 'p1' }),
    )

    expect(res.status).toBe(200)
    expect(
      mockSqlResponses.calls.some((c) =>
        /SELECT title, content, collection/i.test(c.template),
      ),
    ).toBe(false)
    expect(
      mockSqlResponses.calls.some((c) => /UPDATE prompt_versions/i.test(c.template)),
    ).toBe(false)
  })

  it('GET /:id/versions lista el historial acotado al usuario', async () => {
    mockSqlResponses.push([
      {
        id: 'v1',
        title: 'Sintetizar',
        content: 'Texto viejo',
        collection: null,
        created_at: '2026-07-01T00:00:00Z',
      },
    ])

    const res = await handler(
      new Request('http://localhost/api/prompts/p1/versions'),
      mockContext({ id: 'p1' }),
    )

    expect(res.status).toBe(200)
    expect((await res.json())[0].id).toBe('v1')
    const query = mockSqlResponses.calls[0]?.template ?? ''
    expect(query).toMatch(/FROM prompt_versions/i)
    expect(query).toMatch(/v\.user_id =/i)
    expect(query).toMatch(/p\.user_id =/i) // el prompt también, no sólo la versión
    expect(query).toMatch(/v\.deleted_at IS NULL/i)
    expect(query).toMatch(/ORDER BY v\.created_at DESC/i)
  })

  it('restaurar una versión guarda antes la actual: no destruye', async () => {
    mockSqlResponses.push(
      [{ title: 'Sintetizar', content: 'Texto viejo', collection: null }], // la versión
      [TEXTO_ACTUAL], // lectura previa, para tags y variables
      [{ ...PROMPT_ROW, content: 'Texto viejo', versioned: true }],
      [], // poda
    )

    const res = await handler(
      new Request('http://localhost/api/prompts/p1/versions/v1/restore', {
        method: 'POST',
      }),
      mockContext({ id: 'p1', versionId: 'v1' }),
    )

    expect(res.status).toBe(200)
    const escritura = mockSqlResponses.calls.find((c) =>
      /UPDATE prompts/i.test(c.template),
    )
    expect(escritura?.template).toMatch(/INSERT INTO prompt_versions/i)
    expect(
      mockSqlResponses.calls.some((c) => /UPDATE prompt_versions/i.test(c.template)),
    ).toBe(true)
  })

  /**
   * Las dos rutas terminan en `/restore`: deshacer el borrado del prompt y
   * restaurar una versión. Si una se come a la otra el fallo es silencioso —
   * la ruta responde, pero hace lo que no es.
   */
  it('deshacer el borrado y restaurar una versión no se confunden', async () => {
    mockSqlResponses.push([{ restored: true }])
    const deshacer = await handler(
      new Request('http://localhost/api/prompts/p1/restore', {
        method: 'POST',
        body: JSON.stringify({ deletedAt: '2026-06-10T12:00:00Z' }),
      }),
      mockContext({ id: 'p1' }), // sin versionId
    )
    expect(deshacer.status).toBe(200)
    expect(mockSqlResponses.calls[0]?.template).toMatch(/deleted_at = NULL/i)

    mockSqlResponses.reset()
    mockSqlResponses.push(
      [{ title: 'Sintetizar', content: 'Texto viejo', collection: null }],
      [TEXTO_ACTUAL],
      [{ ...PROMPT_ROW, versioned: true }],
      [],
    )
    const versionar = await handler(
      new Request('http://localhost/api/prompts/p1/versions/v1/restore', {
        method: 'POST',
      }),
      mockContext({ id: 'p1', versionId: 'v1' }),
    )
    expect(versionar.status).toBe(200)
    expect(
      mockSqlResponses.calls.some((c) => /deleted_at = NULL/i.test(c.template)),
    ).toBe(false)
  })

  it('una versión de otro usuario devuelve 404 y no escribe', async () => {
    mockSqlResponses.push([]) // la consulta acotada por user_id no devuelve nada

    const res = await handler(
      new Request('http://localhost/api/prompts/p1/versions/ajena/restore', {
        method: 'POST',
      }),
      mockContext({ id: 'p1', versionId: 'ajena' }),
    )

    expect(res.status).toBe(404)
    expect(mockSqlResponses.calls.some((c) => /UPDATE prompts/i.test(c.template))).toBe(
      false,
    )
  })

  it('método no soportado devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/prompts', { method: 'PUT' }),
      mockContext(),
    )

    expect(res.status).toBe(405)
  })
})
