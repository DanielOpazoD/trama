import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import favoritosHandler from '../favoritos'
import { extensionPreflight } from './extension-cors'

/**
 * Endpoint de Favoritos: CRUD + CORS de extensión + restore. SQL mockeado
 * (patrón home-endpoint); se verifica el cableado HTTP: rutas, métodos,
 * validación Zod y shapes de respuesta.
 */
const ROW = {
  id: '6f9619ff-8b86-4d01-b42d-00cf4fc964ff',
  url: 'https://example.com/x',
  title: 'Una página',
  note: null,
  created_at: '2026-06-12T12:00:00.000Z',
  updated_at: '2026-06-12T12:00:00.000Z',
}

beforeEach(() => mockSqlResponses.reset())

describe('favoritos endpoint', () => {
  it('GET lista los favoritos del usuario', async () => {
    mockSqlResponses.push([ROW])
    const res = await favoritosHandler(
      new Request('http://localhost/api/favoritos'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].url).toBe('https://example.com/x')
  })

  it('POST crea un favorito (201 con la fila creada)', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ ...ROW, inserted: true }]) // CTE insert
    const res = await favoritosHandler(
      new Request('http://localhost/api/favoritos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/x', title: 'Una página' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.url).toBe('https://example.com/x')
    expect(body.inserted).toBeUndefined() // bandera interna, no se filtra
  })

  it('POST es idempotente: 200 si la URL ya es favorita', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ ...ROW, inserted: false }]) // fila existente
    const res = await favoritosHandler(
      new Request('http://localhost/api/favoritos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/x' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe(ROW.id)
  })

  it('GET ?url= responde si la página ya es favorita', async () => {
    mockSqlResponses.push([ROW])
    const hit = await favoritosHandler(
      new Request(`http://localhost/api/favoritos?url=${encodeURIComponent(ROW.url)}`),
      mockContext(),
    )
    expect((await hit.json()).favorito.id).toBe(ROW.id)

    mockSqlResponses.push([]) // sin coincidencia
    const miss = await favoritosHandler(
      new Request('http://localhost/api/favoritos?url=https%3A%2F%2Fnope.test%2F'),
      mockContext(),
    )
    expect((await miss.json()).favorito).toBeNull()
  })

  it('POST rechaza una URL inválida (Zod)', async () => {
    const res = await favoritosHandler(
      new Request('http://localhost/api/favoritos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'no-es-url' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('CORS: preflight 204 para orígenes de extensión', () => {
    const pre = extensionPreflight({
      method: 'OPTIONS',
      url: 'http://localhost/api/favoritos',
      headers: {
        get: (k: string) =>
          k.toLowerCase() === 'origin' ? 'chrome-extension://abc' : null,
      },
    } as unknown as Request)
    expect(pre?.status).toBe(204)
  })

  it('PATCH actualiza nota y 404 si no existe', async () => {
    mockSqlResponses.push([{ ...ROW, note: 'para volver' }])
    const ok = await favoritosHandler(
      new Request(`http://localhost/api/favoritos/${ROW.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'para volver' }),
      }),
      mockContext({ id: ROW.id }),
    )
    expect((await ok.json()).note).toBe('para volver')

    mockSqlResponses.push([])
    const missing = await favoritosHandler(
      new Request(`http://localhost/api/favoritos/${ROW.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'x' }),
      }),
      mockContext({ id: ROW.id }),
    )
    expect(missing.status).toBe(404)
  })

  it('DELETE devuelve deletedAt y restore lo consume', async () => {
    mockSqlResponses.push([{ deleted_at: '2026-06-12T13:00:00.000Z' }])
    const del = await favoritosHandler(
      new Request(`http://localhost/api/favoritos/${ROW.id}`, { method: 'DELETE' }),
      mockContext({ id: ROW.id }),
    )
    expect((await del.json()).deletedAt).toBe('2026-06-12T13:00:00.000Z')

    mockSqlResponses.push([{ restored: true }])
    const restore = await favoritosHandler(
      new Request(`http://localhost/api/favoritos/${ROW.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletedAt: '2026-06-12T13:00:00.000Z' }),
      }),
      mockContext({ id: ROW.id }),
    )
    expect((await restore.json()).restored).toBe(true)
  })
})
