import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

// El mock del módulo db tiene que estar ANTES del import del handler.
// Nota: este test vive en _lib/ por restricciones de naming de Netlify Functions
// (no acepta `.test.ts` en /netlify/functions/ porque interpreta el "." como
// inválido). Por eso el path al handler es `../entities` y el mock del módulo
// es `./db.js` desde la perspectiva del SUT.
vi.mock('./db.js', () => setupMockSql())
// observability.persistError usa safeSql() que llama al wrapper; con el
// mock de db.js arriba ya retorna sql, así que persistError intenta hacer
// INSERT INTO error_log... pero como el mock devuelve [] sin error, está OK.
// Adicionalmente neutralizamos cualquier llamada a fetch (embeddings).
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: async () => '',
    json: async () => ({}),
  }),
)

import handler from '../entities'

describe('entities endpoint — integration', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => '',
        json: async () => ({}),
      }),
    )
  })

  describe('GET /api/entities', () => {
    it('devuelve la lista wholesale en formato camelCase', async () => {
      // Respuesta del SELECT (snake_case en la DB)
      mockSqlResponses.push([
        {
          id: 'e1',
          type: 'persona',
          name: 'Borges',
          year: 1899,
          description: 'escritor',
          essay: null,
          position_x: null,
          position_y: null,
          origin: { kind: 'manual' },
          spotify_url: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ])

      const req = new Request('http://localhost/api/entities')
      const res = await handler(req, mockContext())

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0]).toEqual(
        expect.objectContaining({
          id: 'e1',
          type: 'persona',
          name: 'Borges',
        }),
      )
    })

    it('soporta paginación con cursor', async () => {
      mockSqlResponses.push([
        {
          id: 'e1',
          type: 'persona',
          name: 'A',
          year: null,
          description: null,
          essay: null,
          position_x: null,
          position_y: null,
          origin: { kind: 'manual' },
          spotify_url: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ])

      const req = new Request('http://localhost/api/entities?limit=10')
      const res = await handler(req, mockContext())

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('items')
      expect(body).toHaveProperty('nextCursor')
    })

    it('regresión: encoda el cursor en ISO 8601 aunque created_at venga como Date', async () => {
      // Repro del bug γ1 (4094 errores en 24h en prod): Neon HTTP deserializa
      // timestamptz como Date, no como string. Si el endpoint mete eso en
      // una template literal, sale algo como "Thu May 21 2026 16:12:30 ..."
      // que Postgres no parsea en el siguiente fetch del cursor. Acá pasamos
      // Date objects explícitos en la fila simulada y verificamos que el
      // nextCursor sea ISO.
      const rowDate = new Date('2026-05-21T16:12:30.000Z')
      // Devolvemos limit+1 filas para que hasMore=true y se calcule cursor.
      const makeRow = (id: string) => ({
        id,
        type: 'persona',
        name: id,
        year: null,
        description: null,
        essay: null,
        position_x: null,
        position_y: null,
        origin: { kind: 'manual' },
        spotify_url: null,
        created_at: rowDate, // ← clave: pasamos Date, no string
        updated_at: rowDate,
      })
      mockSqlResponses.push([makeRow('a'), makeRow('b'), makeRow('c')])

      const req = new Request('http://localhost/api/entities?limit=2')
      const res = await handler(req, mockContext())
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.nextCursor).toBe('2026-05-21T16:12:30.000Z:b')
      // Asegurar que el cursor NO contiene el formato Date.toString default.
      expect(body.nextCursor).not.toMatch(/GMT|Coordinated Universal Time/)
    })
  })

  describe('DELETE /api/entities/:id', () => {
    it('devuelve { deletedAt } y ejecuta cascade soft-delete', async () => {
      mockSqlResponses.push(
        [{ now: '2026-05-23T12:00:00Z' }], // SELECT NOW()
        [], // UPDATE entities
        [], // UPDATE relationships
        [], // UPDATE quotes
        [], // UPDATE momento_entities
      )

      const req = new Request('http://localhost/api/entities/abc', {
        method: 'DELETE',
      })
      const res = await handler(req, mockContext({ id: 'abc' }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.deletedAt).toBe('2026-05-23T12:00:00Z')

      // Verifica que se ejecutaron los SQL: NOW + entities + relationships + quotes + momento_entities.
      expect(mockSqlResponses.calls.length).toBeGreaterThanOrEqual(5)
      // Y que el id 'abc' apareció en los values de algún UPDATE
      const allValues = mockSqlResponses.calls.flatMap((c) => c.values)
      expect(allValues).toContain('abc')
    })
  })

  it('PATCH con mismo texto fuente no re-embedea', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '',
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchMock)
    mockSqlResponses.push(
      [
        {
          name: 'Borges',
          type: 'persona',
          year: 1899,
          description: 'escritor',
        },
      ],
      [
        {
          id: 'e1',
          type: 'persona',
          name: 'Borges',
          year: 1899,
          description: 'escritor',
          essay: null,
          position_x: null,
          position_y: null,
          origin: { kind: 'manual' },
          spotify_url: null,
          wikipedia_url: null,
          grokipedia_url: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    )

    const res = await handler(
      new Request('http://localhost/api/entities/e1', {
        method: 'PATCH',
        body: JSON.stringify({ description: 'escritor' }),
      }),
      mockContext({ id: 'e1' }),
    )

    expect(res.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockSqlResponses.calls.some((c) => /SET embedding =/i.test(c.template))).toBe(
      false,
    )
  })

  describe('POST /api/entities/:id/restore', () => {
    it('400 si falta deletedAt', async () => {
      const req = new Request('http://localhost/api/entities/abc/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const res = await handler(req, mockContext({ id: 'abc' }))
      expect(res.status).toBe(400)
    })

    it('200 + { restored: true } cuando deletedAt es válido', async () => {
      mockSqlResponses.push(
        [], // UPDATE entities SET deleted_at=NULL
        [], // UPDATE relationships
        [], // UPDATE quotes
        [], // UPDATE momento_entities
      )

      const req = new Request('http://localhost/api/entities/abc/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletedAt: '2026-05-23T12:00:00Z' }),
      })
      const res = await handler(req, mockContext({ id: 'abc' }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.restored).toBe(true)
      // 3 queries de restore + posibles queries internas de validación
      expect(mockSqlResponses.calls.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('Method not allowed', () => {
    it('PUT devuelve 405', async () => {
      const req = new Request('http://localhost/api/entities/abc', {
        method: 'PUT',
        body: JSON.stringify({ name: 'x' }),
      })
      const res = await handler(req, mockContext({ id: 'abc' }))
      expect(res.status).toBe(405)
    })
  })
})
