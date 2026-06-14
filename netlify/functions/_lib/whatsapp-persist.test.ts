import { describe, expect, it, vi } from 'vitest'
import type { SqlClient } from './db'

// embedSafe → null (sin red, determinístico). Mantenemos los builders de
// texto reales (son puros) para no romper las llamadas internas.
vi.mock('./embeddings.js', async (importActual) => {
  const actual = await importActual<typeof import('./embeddings.js')>()
  return { ...actual, embedSafe: vi.fn().mockResolvedValue(null) }
})

import { persistCapture } from './whatsapp/persist'

/**
 * Fake sql tagged-template: devuelve en orden FIFO las respuestas precargadas
 * e ignora los argumentos. Suficiente para ejercitar las ramas de persist
 * (qué confirma, cuántas queries, find-or-create de la entidad de la cita).
 */
function fakeSql(responses: unknown[][]): { sql: SqlClient; calls: number } {
  const state = { calls: 0 }
  const fn = ((..._args: unknown[]) => {
    const next = responses[state.calls] ?? []
    state.calls += 1
    return Promise.resolve(next)
  }) as unknown as SqlClient
  return {
    sql: fn,
    get calls() {
      return state.calls
    },
  }
}

describe('persistCapture', () => {
  it('note → inserta y confirma', async () => {
    const { sql } = fakeSql([[]])
    const msg = await persistCapture(sql, 'u1', { kind: 'note', content: 'comprar pan' })
    expect(msg).toContain('Nota guardada')
  })

  it('momento → inserta y confirma', async () => {
    const { sql } = fakeSql([[]])
    const msg = await persistCapture(sql, 'u1', {
      kind: 'momento',
      bodyText: 'hoy llovió',
    })
    expect(msg).toContain('Momento guardado')
  })

  it('entity → inserta con el nombre en la confirmación', async () => {
    const { sql } = fakeSql([[]])
    const msg = await persistCapture(sql, 'u1', {
      kind: 'entity',
      name: 'Rayuela',
      entityType: 'libro',
      description: null,
    })
    expect(msg).toContain('Rayuela')
  })

  it('quote → CTE atómico find-or-create + insert, confirma con el autor', async () => {
    // Un solo CTE: devuelve la fila con entity_id (sea existente o nueva).
    const fake = fakeSql([[{ entity_id: 'e1' }]])
    const msg = await persistCapture(fake.sql, 'u1', {
      kind: 'quote',
      text: 'el tiempo es una trama',
      author: 'Borges',
    })
    expect(msg).toContain('Borges')
    expect(fake.calls).toBe(1) // multi-write en una sola sentencia
  })

  it('quote → si el CTE no devuelve fila, mensaje de error sin romper', async () => {
    const { sql } = fakeSql([[]])
    const msg = await persistCapture(sql, 'u1', {
      kind: 'quote',
      text: 'x',
      author: 'Z',
    })
    expect(msg).toContain('No pude guardar la cita')
  })
})
