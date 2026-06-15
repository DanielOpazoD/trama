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
 * (qué confirma, qué id devuelve, cuántas queries, find-or-create de la cita).
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
  it('note → inserta, confirma y devuelve el id', async () => {
    const r = await persistCapture(fakeSql([[{ id: 'n1' }]]).sql, 'u1', {
      kind: 'note',
      content: 'comprar pan',
    })
    expect(r.message).toContain('Nota guardada')
    expect(r.id).toBe('n1')
  })

  it('momento → inserta y devuelve el id', async () => {
    const r = await persistCapture(fakeSql([[{ id: 'm1' }]]).sql, 'u1', {
      kind: 'momento',
      bodyText: 'hoy llovió',
    })
    expect(r.message).toContain('Momento añadido')
    expect(r.id).toBe('m1')
  })

  it('task → inserta la tarea en pendientes y devuelve el id', async () => {
    const fake = fakeSql([[{ id: 't1' }]])
    const r = await persistCapture(fake.sql, 'u1', {
      kind: 'task',
      title: 'comprar pan',
      detail: 'antes del viernes',
    })
    expect(r.message).toContain('Tarea')
    expect(r.id).toBe('t1')
    expect(fake.calls).toBe(1)
  })

  it('entity → inserta con el nombre y devuelve el id', async () => {
    const r = await persistCapture(fakeSql([[{ id: 'e1' }]]).sql, 'u1', {
      kind: 'entity',
      name: 'Rayuela',
      entityType: 'libro',
      description: null,
    })
    expect(r.message).toContain('Rayuela')
    expect(r.id).toBe('e1')
  })

  it('quote → CTE atómico find-or-create + insert, devuelve el id de la cita', async () => {
    // Un solo CTE: devuelve la fila con el id de la cita (entidad existente o nueva).
    const fake = fakeSql([[{ id: 'q1' }]])
    const r = await persistCapture(fake.sql, 'u1', {
      kind: 'quote',
      text: 'el tiempo es una trama',
      author: 'Borges',
    })
    expect(r.message).toContain('Borges')
    expect(r.id).toBe('q1')
    expect(fake.calls).toBe(1) // multi-write en una sola sentencia
  })

  it('quote → si el CTE no devuelve fila, mensaje de error e id null', async () => {
    const r = await persistCapture(fakeSql([[]]).sql, 'u1', {
      kind: 'quote',
      text: 'x',
      author: 'Z',
    })
    expect(r.message).toContain('No pude guardar la cita')
    expect(r.id).toBeNull()
  })
})
