import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockSqlResponses, setupMockSql } from '../test-utils'

vi.mock('../db.js', () => setupMockSql())

import { getSql } from '../db.js'
import {
  readRecentMediaCapture,
  appendImagesToMomento,
  appendImagesToRecorteEvent,
} from './album'

beforeEach(() => mockSqlResponses.reset())

describe('readRecentMediaCapture', () => {
  it('devuelve la captura reciente de media cuando hay y está en ventana', async () => {
    mockSqlResponses.push([{ kind: 'recorte', id: 'r1' }])
    expect(await readRecentMediaCapture(getSql(), 'u1', '+569')).toEqual({
      kind: 'recorte',
      id: 'r1',
    })
  })

  it('null cuando no hay fila (no es media o venció la ventana)', async () => {
    mockSqlResponses.push([])
    expect(await readRecentMediaCapture(getSql(), 'u1', '+569')).toBeNull()
  })

  it('null si el kind no es de media (defensivo)', async () => {
    mockSqlResponses.push([{ kind: 'note', id: 'n1' }])
    expect(await readRecentMediaCapture(getSql(), 'u1', '+569')).toBeNull()
  })
})

describe('appendImagesToMomento', () => {
  it('devuelve el nuevo total de fotos del episodio', async () => {
    mockSqlResponses.push([{ total: 4 }])
    const total = await appendImagesToMomento(getSql(), 'u1', 'm1', ['k1', 'k2'])
    expect(total).toBe(4)
    const upd = mockSqlResponses.calls.find((c) => /UPDATE momentos/i.test(c.template))
    expect(upd?.template).toMatch(/jsonb_set/)
    // Los nuevos items viajan como parámetro JSON.
    expect(
      upd?.values.some((v) => typeof v === 'string' && v.includes('"storageKey":"k1"')),
    ).toBe(true)
  })

  it('null cuando el momento ya no existe (borrado entre medio)', async () => {
    mockSqlResponses.push([]) // UPDATE no afectó filas
    expect(await appendImagesToMomento(getSql(), 'u1', 'm1', ['k1'])).toBeNull()
  })
})

describe('appendImagesToRecorteEvent', () => {
  it('promueve el recorte de 1 imagen: portada (0) + nuevas → total correcto', async () => {
    // existing_n=0, había portada → base 1; + 2 nuevas = 3.
    mockSqlResponses.push([{ found: true, existing_n: 0, had_cover: true }])
    const total = await appendImagesToRecorteEvent(getSql(), 'u1', 'r1', [
      { key: 'a', mime: 'image/jpeg' },
      { key: 'b', mime: 'image/png' },
    ])
    expect(total).toBe(3)
    const cte = mockSqlResponses.calls.find((c) =>
      /INSERT INTO recorte_images/i.test(c.template),
    )
    expect(cte?.template).toMatch(/WITH ORDINALITY/)
  })

  it('evento ya con varias filas: anexa después de la última posición', async () => {
    // existing_n=3 → base 3; + 1 nueva = 4.
    mockSqlResponses.push([{ found: true, existing_n: 3, had_cover: true }])
    const total = await appendImagesToRecorteEvent(getSql(), 'u1', 'r1', [
      { key: 'c', mime: 'image/jpeg' },
    ])
    expect(total).toBe(4)
  })

  it('null cuando el recorte ya no existe', async () => {
    mockSqlResponses.push([{ found: false, existing_n: 0, had_cover: null }])
    expect(
      await appendImagesToRecorteEvent(getSql(), 'u1', 'r1', [
        { key: 'a', mime: 'image/jpeg' },
      ]),
    ).toBeNull()
  })
})
