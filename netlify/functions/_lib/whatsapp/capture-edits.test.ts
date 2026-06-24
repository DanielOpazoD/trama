import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockSqlResponses, setupMockSql } from '../test-utils'

vi.mock('../db.js', () => setupMockSql())

import { getSql } from '../db.js'
import { describeLast, recategorizeLast, retitleLast, tagLast } from './capture-edits.js'

beforeEach(() => mockSqlResponses.reset())

describe('retitleLast', () => {
  it('renombra una nota (UPDATE notes) y confirma', async () => {
    mockSqlResponses.push([{ kind: 'note', cap_id: 'c1' }]) // readLastPointer
    mockSqlResponses.push([{ id: 'c1' }]) // UPDATE notes RETURNING
    const msg = await retitleLast(getSql(), 'u1', '+1', 'Mi título')
    expect(msg).toContain('Título actualizado')
    expect(mockSqlResponses.calls[1].template).toContain('UPDATE notes')
  })

  it('sin puntero responde "nada para titular"', async () => {
    mockSqlResponses.push([{ kind: null, cap_id: null }])
    expect(await retitleLast(getSql(), 'u1', '+1', 'x')).toContain('No hay nada reciente')
  })
})

describe('tagLast', () => {
  it('sin etiquetas pide ejemplos (no toca la DB)', async () => {
    expect(await tagLast(getSql(), 'u1', '+1', '   ')).toContain('Dime qué etiquetas')
    expect(mockSqlResponses.calls).toHaveLength(0)
  })

  it('agrega tags deduplicados a una nota', async () => {
    mockSqlResponses.push([{ kind: 'note', cap_id: 'c1' }]) // readLastPointer
    mockSqlResponses.push([{ id: 'c1' }]) // UPDATE notes RETURNING
    const msg = await tagLast(getSql(), 'u1', '+1', 'trabajo, ideas')
    expect(msg).toContain('Etiquetas agregadas')
    expect(mockSqlResponses.calls[1].template).toContain('unnest')
  })
})

describe('describeLast', () => {
  it('si la última captura no es foto, lo dice', async () => {
    mockSqlResponses.push([{ kind: 'note', cap_id: 'c1' }]) // readLastPointer → note
    const msg = await describeLast(getSql(), 'u1', '+1', '', 'http://x')
    expect(msg).toContain('No hay ninguna foto reciente')
  })
})

describe('recategorizeLast', () => {
  it('sin puntero responde "nada para reclasificar"', async () => {
    mockSqlResponses.push([{ kind: null, cap_id: null }])
    expect(await recategorizeLast(getSql(), 'u1', '+1', 'note', 'http://x')).toContain(
      'No hay nada reciente',
    )
  })

  it('una foto (recorte) no se vuelve tarea', async () => {
    mockSqlResponses.push([{ kind: 'recorte', cap_id: 'c1' }])
    const msg = await recategorizeLast(getSql(), 'u1', '+1', 'task', 'http://x')
    expect(msg).toContain('Una foto no se vuelve tarea')
  })
})
