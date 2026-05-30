import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
// Desacoplamos del cost-cap (haría sus propias queries al FIFO): siempre deja
// pasar. Su lógica está testeada aparte en cost-cap/budget tests.
vi.mock('./cost-cap.js', () => ({ checkMonthlyBudget: vi.fn(async () => null) }))

import handler from '../voz'

/**
 * /api/entities/:id/voz — "Voz de…". Estos tests cubren el contrato de
 * validación y los gates (método, id, body, entidad inexistente, mínimo de
 * citas). El camino feliz con LLM se cubre en llm.test.ts (dispatch).
 */
describe('voz endpoint — validación + gates', () => {
  beforeEach(() => mockSqlResponses.reset())
  afterEach(() => vi.unstubAllGlobals())

  it('GET devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/entities/e1/voz'),
      mockContext({ id: 'e1' }),
    )
    expect(res.status).toBe(405)
  })

  it('POST sin id devuelve 400', async () => {
    const res = await handler(
      new Request('http://localhost/api/entities//voz', {
        method: 'POST',
        body: JSON.stringify({ question: 'x' }),
      }),
      mockContext({}),
    )
    expect(res.status).toBe(400)
  })

  it('POST con body inválido (sin question) devuelve 400', async () => {
    const res = await handler(
      new Request('http://localhost/api/entities/e1/voz', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      mockContext({ id: 'e1' }),
    )
    expect(res.status).toBe(400)
  })

  it('entidad inexistente devuelve 404', async () => {
    mockSqlResponses.push([]) // SELECT entity vacío
    const res = await handler(
      new Request('http://localhost/api/entities/e1/voz', {
        method: 'POST',
        body: JSON.stringify({ question: 'sobre el tiempo' }),
      }),
      mockContext({ id: 'e1' }),
    )
    expect(res.status).toBe(404)
  })

  it('menos de 5 citas devuelve 422', async () => {
    mockSqlResponses.push(
      [{ name: 'Borges', type: 'escritor', description: null }], // entity
      [
        { text: 'a', source: null },
        { text: 'b', source: null },
      ], // solo 2 citas (<5)
    )
    const res = await handler(
      new Request('http://localhost/api/entities/e1/voz', {
        method: 'POST',
        body: JSON.stringify({ question: 'sobre el tiempo' }),
      }),
      mockContext({ id: 'e1' }),
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error?.message).toMatch(/al menos 5 citas/i)
  })
})
