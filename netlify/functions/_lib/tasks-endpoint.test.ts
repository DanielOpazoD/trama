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
  completed_at: null,
  tags: ['ensayo'],
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
}

describe('tasks endpoint — integration', () => {
  beforeEach(() => mockSqlResponses.reset())
  afterEach(() => vi.unstubAllGlobals())

  it('GET devuelve la lista', async () => {
    mockSqlResponses.push([TASK_ROW])
    const res = await handler(new Request('http://localhost/api/tasks'), mockContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ id: 't1', title: 'Terminar el ensayo' })
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
  })

  it('método no soportado devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/tasks', { method: 'PUT' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })
})
