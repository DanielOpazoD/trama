import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockSqlResponses, setupMockSql } from '../test-utils'

vi.mock('../db.js', () => setupMockSql())

import { getSql } from '../db.js'
import {
  NOUN_BY_KIND,
  readCaptureText,
  readLastPointer,
  recordLastCapture,
  softDeleteCapture,
  undoLastCapture,
} from './last-capture.js'

beforeEach(() => mockSqlResponses.reset())

describe('softDeleteCapture', () => {
  it('devuelve true y apunta a la tabla del kind cuando borró una fila', async () => {
    mockSqlResponses.push([{ id: 'c1' }])
    const ok = await softDeleteCapture(getSql(), 'u1', 'note', 'c1')
    expect(ok).toBe(true)
    expect(mockSqlResponses.calls[0].template).toContain('UPDATE notes')
  })

  it('devuelve false cuando no borró nada', async () => {
    mockSqlResponses.push([])
    expect(await softDeleteCapture(getSql(), 'u1', 'momento', 'c1')).toBe(false)
    expect(mockSqlResponses.calls[0].template).toContain('UPDATE momentos')
  })

  it('un kind desconocido no ejecuta ningún UPDATE', async () => {
    expect(await softDeleteCapture(getSql(), 'u1', 'wat', 'c1')).toBe(false)
    expect(mockSqlResponses.calls).toHaveLength(0)
  })
})

describe('readLastPointer', () => {
  it('devuelve {kind,id} cuando hay puntero', async () => {
    mockSqlResponses.push([{ kind: 'note', cap_id: 'c1' }])
    expect(await readLastPointer(getSql(), 'u1', '+1')).toEqual({
      kind: 'note',
      id: 'c1',
    })
  })

  it('null cuando el puntero está vacío', async () => {
    mockSqlResponses.push([{ kind: null, cap_id: null }])
    expect(await readLastPointer(getSql(), 'u1', '+1')).toBeNull()
  })
})

describe('undoLastCapture', () => {
  it('sin puntero responde "nada para deshacer"', async () => {
    mockSqlResponses.push([])
    expect(await undoLastCapture(getSql(), 'u1', '+1')).toContain('No hay nada reciente')
  })

  it('con puntero soft-deletea y confirma con el sustantivo del kind', async () => {
    mockSqlResponses.push([{ kind: 'note', cap_id: 'c1' }]) // SELECT puntero
    mockSqlResponses.push([{ id: 'c1' }]) // softDelete → 1 fila
    mockSqlResponses.push([]) // limpieza del puntero (best-effort)
    const msg = await undoLastCapture(getSql(), 'u1', '+1')
    expect(msg).toContain('La nota')
    expect(msg).toContain('eliminó')
  })

  it('un fallo al limpiar el puntero no rompe el deshacer (best-effort awaited)', async () => {
    mockSqlResponses.push([{ kind: 'note', cap_id: 'c1' }]) // SELECT puntero
    mockSqlResponses.push([{ id: 'c1' }]) // softDelete
    mockSqlResponses.pushError(new Error('db down')) // la limpieza del puntero falla
    const msg = await undoLastCapture(getSql(), 'u1', '+1')
    expect(msg).toContain('eliminó')
  })
})

describe('readCaptureText', () => {
  it('devuelve el texto recortado', async () => {
    mockSqlResponses.push([{ t: '  hola  ' }])
    expect(await readCaptureText(getSql(), 'note', 'c1', 'u1')).toBe('hola')
  })

  it('null cuando el texto está vacío', async () => {
    mockSqlResponses.push([{ t: '   ' }])
    expect(await readCaptureText(getSql(), 'note', 'c1', 'u1')).toBeNull()
  })

  it('lee el título de una task (FROM tasks)', async () => {
    mockSqlResponses.push([{ t: 'comprar pan' }])
    expect(await readCaptureText(getSql(), 'task', 'c1', 'u1')).toBe('comprar pan')
    expect(mockSqlResponses.calls[0].template).toContain('FROM tasks')
  })
})

describe('recordLastCapture', () => {
  it('emite el UPDATE del puntero last_capture_*', async () => {
    mockSqlResponses.push([])
    await recordLastCapture(getSql(), '+1', 'u1', 'note', 'c1')
    expect(mockSqlResponses.calls[0].template).toContain('last_capture_kind')
  })

  it('un fallo de DB no propaga (best-effort)', async () => {
    mockSqlResponses.pushError(new Error('db down'))
    await expect(
      recordLastCapture(getSql(), '+1', 'u1', 'note', 'c1'),
    ).resolves.toBeUndefined()
  })
})

describe('NOUN_BY_KIND', () => {
  it('mapea kinds a sustantivos legibles', () => {
    expect(NOUN_BY_KIND.note).toBe('La nota')
    expect(NOUN_BY_KIND.momento).toBe('El momento')
  })
})
