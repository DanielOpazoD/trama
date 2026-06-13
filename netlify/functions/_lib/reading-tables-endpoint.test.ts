import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import readingTablesHandler from '../reading-tables'

/**
 * Endpoint de mesas/proyectos editoriales: CRUD + restore. SQL mockeado;
 * se verifica el cableado HTTP (rutas, métodos, validación Zod, shapes).
 */
const ROW = {
  id: '6f9619ff-8b86-4d01-b42d-00cf4fc964ff',
  title: 'Ensayo sobre la memoria',
  material_ids: ['recorte:a', 'note:b'],
  draft_markdown: '# Tesis',
  status: 'borrador',
  created_at: '2026-06-13T12:00:00.000Z',
  updated_at: '2026-06-13T12:00:00.000Z',
}

beforeEach(() => mockSqlResponses.reset())

describe('reading-tables endpoint', () => {
  it('GET lista los proyectos del usuario', async () => {
    mockSqlResponses.push([ROW])
    const res = await readingTablesHandler(
      new Request('http://localhost/api/reading-tables'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].title).toBe('Ensayo sobre la memoria')
    expect(body[0].material_ids).toEqual(['recorte:a', 'note:b'])
  })

  it('POST crea un proyecto (201 con la fila creada)', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([ROW]) // insert
    const res = await readingTablesHandler(
      new Request('http://localhost/api/reading-tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Ensayo sobre la memoria',
          materialIds: ['recorte:a', 'note:b'],
          draftMarkdown: '# Tesis',
        }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(201)
    expect((await res.json()).title).toBe('Ensayo sobre la memoria')
  })

  it('POST rechaza un título vacío (Zod)', async () => {
    const res = await readingTablesHandler(
      new Request('http://localhost/api/reading-tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '   ' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('PATCH actualiza el borrador y 404 si no existe', async () => {
    mockSqlResponses.push([{ ...ROW, draft_markdown: '# Reescrito' }])
    const ok = await readingTablesHandler(
      new Request(`http://localhost/api/reading-tables/${ROW.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftMarkdown: '# Reescrito' }),
      }),
      mockContext({ id: ROW.id }),
    )
    expect((await ok.json()).draft_markdown).toBe('# Reescrito')

    mockSqlResponses.push([])
    const missing = await readingTablesHandler(
      new Request(`http://localhost/api/reading-tables/${ROW.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cerrado' }),
      }),
      mockContext({ id: ROW.id }),
    )
    expect(missing.status).toBe(404)
  })

  it('DELETE devuelve deletedAt y restore lo consume', async () => {
    mockSqlResponses.push([{ deleted_at: '2026-06-13T13:00:00.000Z' }])
    const del = await readingTablesHandler(
      new Request(`http://localhost/api/reading-tables/${ROW.id}`, { method: 'DELETE' }),
      mockContext({ id: ROW.id }),
    )
    expect((await del.json()).deletedAt).toBe('2026-06-13T13:00:00.000Z')

    mockSqlResponses.push([{ restored: true }])
    const restore = await readingTablesHandler(
      new Request(`http://localhost/api/reading-tables/${ROW.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletedAt: '2026-06-13T13:00:00.000Z' }),
      }),
      mockContext({ id: ROW.id }),
    )
    expect((await restore.json()).restored).toBe(true)
  })
})
