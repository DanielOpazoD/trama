import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

// El mock de db.js tiene que estar ANTES del import del handler (vive en _lib/
// por el naming de Netlify Functions; el SUT es `../tasks`).
vi.mock('./db.js', () => setupMockSql())

import handler from '../tasks'

const TASK_ROW = {
  id: 't1',
  title: 'Terminar el ensayo',
  detail: null,
  done: false,
  due_date: '2026-06-01',
  priority: 'media',
  week_start: '2026-06-01',
  category: 'trabajo',
  has_photos: false,
  completed_at: null,
  tags: ['ensayo'],
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
}

describe('tasks endpoint — integration', () => {
  beforeEach(() => mockSqlResponses.reset())
  afterEach(() => vi.unstubAllGlobals())

  it('GET devuelve la lista e incluye el flag has_photos (EXISTS)', async () => {
    mockSqlResponses.push([TASK_ROW])
    const res = await handler(new Request('http://localhost/api/tasks'), mockContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ id: 't1', title: 'Terminar el ensayo' })
    // El SELECT deriva has_photos con un EXISTS sobre notas_attachments.
    const q = mockSqlResponses.calls.find((c) => /FROM tasks/i.test(c.template))
    expect(q?.template).toMatch(/deleted_at IS NULL/i)
    expect(q?.template).toMatch(/user_id =/i)
    expect(q?.template).toMatch(/EXISTS\(SELECT 1 FROM notas_attachments/i)
    expect(q?.template).toMatch(/AS has_photos/i)
  })

  it('GET ?q y ?tag filtran dentro del usuario y excluyen soft-deleted', async () => {
    mockSqlResponses.push([TASK_ROW], [TASK_ROW])

    const byText = await handler(
      new Request('http://localhost/api/tasks?q=ensayo'),
      mockContext(),
    )
    const byTag = await handler(
      new Request('http://localhost/api/tasks?tag=Ensayo'),
      mockContext(),
    )

    expect(byText.status).toBe(200)
    expect(byTag.status).toBe(200)
    const search = mockSqlResponses.calls.find((c) => /title ILIKE/i.test(c.template))
    const tag = mockSqlResponses.calls.find((c) => /ANY\(tags\)/i.test(c.template))
    expect(search?.template).toMatch(/deleted_at IS NULL/i)
    expect(search?.template).toMatch(/user_id =/i)
    expect(search?.values).toContain('%ensayo%')
    expect(tag?.template).toMatch(/deleted_at IS NULL/i)
    expect(tag?.template).toMatch(/user_id =/i)
    expect(tag?.values).toContain('ensayo')
  })

  it('POST con título válido crea (201) y deriva tags', async () => {
    mockSqlResponses.push(
      [], // ensureUserRow
      [{ ...TASK_ROW, title: 'leer #rayuela', tags: ['rayuela'] }],
    )
    const res = await handler(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'leer #rayuela' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.tags).toEqual(['rayuela'])
    // El INSERT recibió las tags derivadas en el server, no del cliente.
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO tasks/i.test(c.template),
    )
    expect(insert).toBeDefined()
  })

  it('POST con category persiste la pestaña elegida y la devuelve', async () => {
    mockSqlResponses.push(
      [], // ensureUserRow
      [{ ...TASK_ROW, category: 'personal' }],
    )
    const res = await handler(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'comprar pan', category: 'personal' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.category).toBe('personal')
    // El INSERT incluye la columna category y bindea el valor enviado.
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO tasks/i.test(c.template),
    )
    expect(insert?.template).toMatch(/category/i)
    expect(insert?.values).toContain('personal')
  })

  it('POST con category inválida devuelve 400 (validación Zod)', async () => {
    const res = await handler(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'x', category: 'urgente' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('PATCH category mueve la tarea de pestaña (Trabajo → Personal)', async () => {
    mockSqlResponses.push([{ ...TASK_ROW, category: 'personal' }])
    const res = await handler(
      new Request('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({ category: 'personal' }),
      }),
      mockContext({ id: 't1' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.category).toBe('personal')
    const update = mockSqlResponses.calls.find((c) => /UPDATE tasks/i.test(c.template))
    expect(update?.template).toMatch(/category =/i)
    expect(update?.values).toContain('personal')
  })

  it('POST sin título devuelve 400 (validación Zod)', async () => {
    const res = await handler(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ detail: 'sin título' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error?.code).toBeDefined()
    expect(
      mockSqlResponses.calls.some((c) => /INSERT INTO tasks/i.test(c.template)),
    ).toBe(false)
  })

  it('PATCH done:true actualiza y devuelve 200', async () => {
    mockSqlResponses.push([
      { ...TASK_ROW, done: true, completed_at: '2026-05-10T00:00:00Z' },
    ])
    const res = await handler(
      new Request('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({ done: true }),
      }),
      mockContext({ id: 't1' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.done).toBe(true)
  })

  it('PATCH title/detail re-deriva tags y mantiene scope por usuario', async () => {
    mockSqlResponses.push(
      [{ title: 'Viejo #archivo', detail: null }],
      [{ ...TASK_ROW, title: 'Nuevo #claridad', detail: 'detalle #foco' }],
    )

    const res = await handler(
      new Request('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Nuevo #claridad', detail: 'detalle #foco' }),
      }),
      mockContext({ id: 't1' }),
    )

    expect(res.status).toBe(200)
    const select = mockSqlResponses.calls.find((c) =>
      /SELECT title, detail/i.test(c.template),
    )
    const update = mockSqlResponses.calls.find((c) => /UPDATE tasks/i.test(c.template))
    expect(select?.template).toMatch(/deleted_at IS NULL/i)
    expect(select?.template).toMatch(/user_id =/i)
    expect(update?.template).toMatch(/deleted_at IS NULL/i)
    expect(update?.template).toMatch(/user_id =/i)
    expect(update?.values).toContainEqual(['claridad', 'foco'])
  })

  it('PATCH sobre id inexistente devuelve 404', async () => {
    mockSqlResponses.push([]) // UPDATE ... RETURNING vacío
    const res = await handler(
      new Request('http://localhost/api/tasks/nope', {
        method: 'PATCH',
        body: JSON.stringify({ done: true }),
      }),
      mockContext({ id: 'nope' }),
    )
    expect(res.status).toBe(404)
  })

  it('DELETE hace soft-delete y devuelve {ok}', async () => {
    const res = await handler(
      new Request('http://localhost/api/tasks/t1', { method: 'DELETE' }),
      mockContext({ id: 't1' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    // DELETE real es UPDATE SET deleted_at (soft-delete), nunca DELETE FROM.
    const del = mockSqlResponses.calls.find((c) =>
      /deleted_at = NOW\(\)/i.test(c.template),
    )
    expect(del).toBeDefined()
    expect(
      mockSqlResponses.calls.some((c) => /DELETE FROM tasks/i.test(c.template)),
    ).toBe(false)
    expect(mockSqlResponses.calls[0]?.template).toMatch(/user_id =/i)
    expect(mockSqlResponses.calls[1]?.template).toMatch(/UPDATE notas_attachments/i)
    expect(mockSqlResponses.calls[1]?.template).toMatch(/owner_type = 'task'/i)
    expect(mockSqlResponses.calls[1]?.template).toMatch(/user_id =/i)
  })

  it('método no soportado devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/tasks', { method: 'PUT' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  it('GET ?pending=1 consulta solo pendientes (done = false)', async () => {
    mockSqlResponses.push([TASK_ROW])
    const res = await handler(
      new Request('http://localhost/api/tasks?pending=1'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const q = mockSqlResponses.calls.find((c) => /FROM tasks/i.test(c.template))
    expect(q?.template).toMatch(/done = false/i)
  })

  it('GET por rango filtra por week_start e incluye el arrastre (carryBefore)', async () => {
    mockSqlResponses.push([TASK_ROW])
    const res = await handler(
      new Request(
        'http://localhost/api/tasks?weekFrom=2026-06-01&weekTo=2026-06-29&carryBefore=2026-06-01',
      ),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const q = mockSqlResponses.calls.find((c) => /FROM tasks/i.test(c.template))
    expect(q?.template).toMatch(/week_start >=/i)
    expect(q?.template).toMatch(/week_start </i)
  })

  it('GET por rango con fecha mal formada devuelve 400', async () => {
    const res = await handler(
      new Request('http://localhost/api/tasks?weekFrom=junio&weekTo=2026-06-29'),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })
})
