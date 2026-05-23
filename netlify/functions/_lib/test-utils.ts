import { vi, type Mock } from 'vitest'

/**
 * Helper de testing para endpoints Netlify Functions.
 *
 * Los handlers usan `getSql()` desde './_lib/db.js' para hablar con Postgres.
 * Para tests de integración (sin DB real) hacemos un mock del módulo db
 * que devuelve respuestas predefinidas en orden FIFO. El test puede
 * inspeccionar `mockSql.calls` para verificar QUÉ queries se ejecutaron.
 *
 * Uso típico:
 *
 *   import { setupMockSql, mockSqlResponses } from './_lib/test-utils'
 *
 *   vi.mock('./_lib/db.js', () => setupMockSql())
 *
 *   beforeEach(() => mockSqlResponses.reset())
 *
 *   it('GET returns 200', async () => {
 *     mockSqlResponses.push([{ id: 'abc' }])  // respuesta para el SELECT
 *     const res = await handler(new Request('http://localhost/api/x'), ctx)
 *     expect(res.status).toBe(200)
 *   })
 */

// State del mock — accesible desde cualquier test que importe estos helpers.
export const mockSqlState = {
  /** Cola FIFO de respuestas que el sql mock va devolviendo. */
  responses: [] as unknown[][],
  /** Historial de queries ejecutadas (template + valores interpolados). */
  calls: [] as Array<{ template: string; values: unknown[] }>,
}

/**
 * Helper para configurar respuestas y leer historial. Se reinicia entre
 * tests con `mockSqlResponses.reset()`.
 */
export const mockSqlResponses = {
  reset() {
    mockSqlState.responses.length = 0
    mockSqlState.calls.length = 0
  },
  push(...rows: unknown[][]) {
    mockSqlState.responses.push(...rows)
  },
  get calls() {
    return mockSqlState.calls
  },
}

/**
 * Mock factory para `vi.mock('./_lib/db.js', () => setupMockSql())`.
 *
 * Devuelve un objeto con `getSql()` que retorna un tagged template literal
 * (igual al cliente Neon HTTP que usa el código real). Cada llamada al
 * template se registra en `mockSqlState.calls` y devuelve la siguiente
 * respuesta pre-cargada.
 *
 * Si no hay respuesta pre-cargada para una query, devuelve [] (array vacío).
 * Eso modela el caso "esta query no afecta al test bajo prueba".
 */
export function setupMockSql() {
  function sql(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown[]> {
    mockSqlState.calls.push({
      template: strings.join('?'),
      values,
    })
    return Promise.resolve(mockSqlState.responses.shift() ?? [])
  }
  return {
    getSql: () => sql,
  }
}

/**
 * Construye un objeto Context mock para los handlers de Netlify Functions.
 * Solo populamos lo que los handlers efectivamente usan (params).
 */
export function mockContext(params: Record<string, string> = {}) {
  return {
    params,
  } as unknown as import('@netlify/functions').Context
}

/**
 * Mock de fetch para tests que cruzan a APIs externas (LLM providers, etc.).
 * Por default no hace nada — el test puede sobreescribir con vi.stubGlobal.
 */
export function makeFetchMock(): Mock {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({}),
  })
}
