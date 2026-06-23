import { expect, vi, type Mock } from 'vitest'
import type { ApiErrorCode } from './api-error'

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
  /** Cola FIFO de respuestas que el sql mock va devolviendo. Cada entrada son
   *  las filas a devolver, o un `Error` para simular que esa query falla. */
  responses: [] as unknown[],
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
  /** Encola un fallo: la próxima query del mock rechaza con este error (para
   *  ejercitar caminos de error/resiliencia, p. ej. un handler que lanza). */
  pushError(error: unknown) {
    mockSqlState.responses.push(error instanceof Error ? error : new Error(String(error)))
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
  function nextResponse(): unknown[] {
    const next = mockSqlState.responses.shift()
    // Un Error encolado (via pushError) hace que esa query falle, igual que un
    // hipo de DB real: el mock rechaza en vez de resolver.
    if (next instanceof Error) throw next
    return (next as unknown[] | undefined) ?? []
  }

  // Mirror fiel del driver Neon HTTP: un tagged template anidado o un
  // `sql.unsafe(...)` interpolado como valor NO es un parámetro, se aplana
  // dentro de la query padre (ver toParameterizedQuery del bundle). Sin esto,
  // el builder de los CTE de recortes (que compone `inserted AS (${fragment})`)
  // dejaría el INSERT fuera del `.template` que inspeccionan los tests.
  // El aplanado es aditivo: ninguna query existente interpola fragmentos.
  type MockFragment = {
    __mockSqlFragment: true
    strings: TemplateStringsArray
    values: unknown[]
  }
  type MockUnsafe = { __mockSqlUnsafe: true; sql: string }
  const isFragment = (v: unknown): v is MockFragment =>
    typeof v === 'object' && v !== null && (v as MockFragment).__mockSqlFragment === true
  const isUnsafe = (v: unknown): v is MockUnsafe =>
    typeof v === 'object' &&
    v !== null &&
    (v as MockUnsafe).__mockSqlUnsafe === true &&
    typeof (v as MockUnsafe).sql === 'string' &&
    !isFragment(v)

  // Aplana strings/values de un template (con sub-fragmentos y unsafe) a un
  // único `{ template, values }`, replicando el placeholder '?' del mock previo.
  function flatten(
    strings: ArrayLike<string>,
    values: unknown[],
  ): { template: string; values: unknown[] } {
    let template = strings[0] ?? ''
    const flatValues: unknown[] = []
    for (let i = 0; i < values.length; i++) {
      const value = values[i]
      if (isUnsafe(value)) {
        template += value.sql
      } else if (isFragment(value)) {
        const nested = flatten(value.strings, value.values)
        template += nested.template
        flatValues.push(...nested.values)
      } else {
        template += '?'
        flatValues.push(value)
      }
      template += strings[i + 1] ?? ''
    }
    return { template, values: flatValues }
  }

  function record(strings: TemplateStringsArray, values: unknown[]): void {
    mockSqlState.calls.push(flatten(strings, values))
  }

  // El template es un thenable perezoso: registra la call y consume una
  // respuesta SOLO al await-earse (top-level), no al construirse. Así un
  // fragmento interpolado (que nunca se awaitea) no consume respuesta ni
  // ensucia el historial; al await-earse el padre, el fragmento se aplana.
  function sql(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
    const fragment: MockFragment = { __mockSqlFragment: true, strings, values }
    const run = (): Promise<unknown[]> => {
      record(strings, values)
      try {
        return Promise.resolve(nextResponse())
      } catch (err) {
        return Promise.reject(err)
      }
    }
    const thenable = {
      ...fragment,
      then: (
        onfulfilled?: ((value: unknown[]) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null,
      ) => run().then(onfulfilled, onrejected),
      catch: (onrejected?: ((reason: unknown) => unknown) | null) =>
        run().catch(onrejected),
      finally: (onfinally?: (() => void) | null) => run().finally(onfinally),
    }
    return thenable as unknown as Promise<unknown[]>
  }
  sql.unsafe = (rawSql: string): MockUnsafe => ({ __mockSqlUnsafe: true, sql: rawSql })
  sql.transaction = async (fn: (tx: typeof sql) => unknown[]) => {
    const tx = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      record(strings, values)
      return {}
    }) as typeof sql
    const queries = fn(tx)
    return queries.map(() => nextResponse())
  }
  return {
    getSql: () => sql,
    // N9: sqlTyped<Row> es un helper tipado en el módulo real.
    // En tests no validamos el tipo (es un cast); solo pasamos la
    // promise al pipeline para que devuelva las rows pre-cargadas
    // en `mockSqlResponses`.
    sqlTyped: <Row>(query: Promise<unknown>) => query as Promise<Row[]>,
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

export async function expectCanonicalError(
  response: Response,
  opts: {
    status: number
    code: ApiErrorCode
    requestId?: string
  },
) {
  expect(response.status).toBe(opts.status)
  if (opts.requestId) {
    expect(response.headers.get('x-request-id')).toBe(opts.requestId)
  }
  const body = await response.json()
  expect(body).toMatchObject({
    error: {
      code: opts.code,
      ...(opts.requestId ? { requestId: opts.requestId } : {}),
    },
  })
  return body
}
