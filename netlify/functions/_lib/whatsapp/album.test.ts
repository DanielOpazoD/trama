import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockSqlResponses, setupMockSql } from '../test-utils'

vi.mock('../db.js', () => setupMockSql())

import { getSql } from '../db.js'
import {
  readRecentMediaCapture,
  appendImagesToMomento,
  appendImagesToRecorteEvent,
  joinRecortePhotosToMomento,
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

  it('reintenta ante colisión de posición concurrente (23505) y converge', async () => {
    // Primer intento: choca con un append concurrente del mismo álbum.
    mockSqlResponses.pushError(
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    )
    // Segundo intento: snapshot fresco, ya hay 3 filas commiteadas → base 3 + 1.
    mockSqlResponses.push([{ found: true, existing_n: 3, had_cover: true }])
    const total = await appendImagesToRecorteEvent(getSql(), 'u1', 'r1', [
      { key: 'c', mime: 'image/jpeg' },
    ])
    expect(total).toBe(4)
    // Corrió el CTE dos veces (la fallida + la exitosa).
    const cte = mockSqlResponses.calls.filter((c) =>
      /INSERT INTO recorte_images/i.test(c.template),
    )
    expect(cte.length).toBe(2)
  })

  it('un error que NO es de UNIQUE se propaga sin reintentar', async () => {
    mockSqlResponses.pushError(Object.assign(new Error('boom'), { code: '42P01' }))
    await expect(
      appendImagesToRecorteEvent(getSql(), 'u1', 'r1', [
        { key: 'a', mime: 'image/jpeg' },
      ]),
    ).rejects.toThrow('boom')
    const cte = mockSqlResponses.calls.filter((c) =>
      /INSERT INTO recorte_images/i.test(c.template),
    )
    expect(cte.length).toBe(1)
  })
})

describe('joinRecortePhotosToMomento (orden copy→append→remove)', () => {
  const okCopy = () =>
    vi.fn(async (_store: string, key: string) => ({ storageKey: `m-${key}` }))

  it('éxito: copia, anexa y SOLO entonces borra los originales de recortes-media', async () => {
    const ops = { copy: okCopy(), remove: vi.fn(async () => {}) }
    mockSqlResponses.push([{ total: 3 }]) // appendImagesToMomento → confirma
    const total = await joinRecortePhotosToMomento(
      getSql(),
      'u1',
      'm1',
      [{ key: 'a' }, { key: 'b' }],
      ops,
    )
    expect(total).toBe(3)
    // Copió ambos blobs al store de momentos.
    expect(ops.copy).toHaveBeenCalledWith('momentos-media', 'a', 'u1')
    expect(ops.copy).toHaveBeenCalledWith('momentos-media', 'b', 'u1')
    // Con el anexado confirmado, borró los ORIGINALES en recortes-media…
    expect(ops.remove).toHaveBeenCalledWith('recortes-media', 'a')
    expect(ops.remove).toHaveBeenCalledWith('recortes-media', 'b')
    // …y nunca las copias recién hechas en momentos-media.
    expect(ops.remove).not.toHaveBeenCalledWith('momentos-media', expect.anything())
  })

  it('anexado falla (momento borrado): revierte copias huérfanas y NO toca los originales', async () => {
    const ops = { copy: okCopy(), remove: vi.fn(async () => {}) }
    mockSqlResponses.push([]) // appendImagesToMomento → null (el momento ya no existe)
    const total = await joinRecortePhotosToMomento(
      getSql(),
      'u1',
      'm1',
      [{ key: 'a' }, { key: 'b' }],
      ops,
    )
    expect(total).toBeNull()
    // Revirtió las copias huérfanas en momentos-media…
    expect(ops.remove).toHaveBeenCalledWith('momentos-media', 'm-a')
    expect(ops.remove).toHaveBeenCalledWith('momentos-media', 'm-b')
    // …y JAMÁS borró los originales: el recorte de respaldo los reutiliza intactos
    // (esta es la regresión que el fix evita: recortes apuntando a blobs 404).
    expect(ops.remove).not.toHaveBeenCalledWith('recortes-media', expect.anything())
  })

  it('ninguna copia posible (blobs origen ausentes) → null sin anexar ni borrar', async () => {
    const ops = { copy: vi.fn(async () => null), remove: vi.fn(async () => {}) }
    const total = await joinRecortePhotosToMomento(
      getSql(),
      'u1',
      'm1',
      [{ key: 'a' }],
      ops,
    )
    expect(total).toBeNull()
    expect(ops.remove).not.toHaveBeenCalled()
    expect(mockSqlResponses.calls.some((c) => /UPDATE momentos/i.test(c.template))).toBe(
      false,
    )
  })
})
