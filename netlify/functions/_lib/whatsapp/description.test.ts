import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockSqlResponses, setupMockSql } from '../test-utils'

vi.mock('../db.js', () => setupMockSql())

import { getSql } from '../db.js'
import { consumeAwaitingDescription, setAwaitingDescription } from './description'

beforeEach(() => mockSqlResponses.reset())

describe('consumeAwaitingDescription', () => {
  it('aplica el texto a un recorte pendiente y lo limpia', async () => {
    mockSqlResponses.push([{ kind: 'recorte', id: 'r1' }]) // SELECT awaiting
    mockSqlResponses.push([{ id: 'r1' }]) // UPDATE recortes (aplicó)
    mockSqlResponses.push([]) // clearAwaitingDescription
    const res = await consumeAwaitingDescription(
      getSql(),
      'u1',
      '+569',
      'una tarde de lluvia',
    )
    expect(res).toEqual({ kind: 'recorte' })
    const upd = mockSqlResponses.calls.find((c) => /UPDATE recortes/i.test(c.template))
    expect(upd?.values).toContain('una tarde de lluvia')
  })

  it('aplica el texto a un momento foto (payload.caption)', async () => {
    mockSqlResponses.push([{ kind: 'momento', id: 'm1' }]) // SELECT awaiting
    mockSqlResponses.push([{ id: 'm1' }]) // UPDATE momentos
    mockSqlResponses.push([]) // clear
    const res = await consumeAwaitingDescription(getSql(), 'u1', '+569', 'con Lola')
    expect(res).toEqual({ kind: 'momento' })
    const upd = mockSqlResponses.calls.find((c) => /UPDATE momentos/i.test(c.template))
    expect(upd?.template).toMatch(/jsonb_set/)
    expect(upd?.template).toMatch(/'foto'/) // solo aplica a kind=foto
  })

  it('null cuando no hay descripción pendiente (no toca nada)', async () => {
    mockSqlResponses.push([]) // SELECT awaiting vacío
    const res = await consumeAwaitingDescription(getSql(), 'u1', '+569', 'algo')
    expect(res).toBeNull()
    expect(mockSqlResponses.calls.some((c) => /UPDATE recortes/i.test(c.template))).toBe(
      false,
    )
  })

  it('null si la captura ya no existe (la UPDATE no afecta filas), pero limpia', async () => {
    mockSqlResponses.push([{ kind: 'recorte', id: 'r1' }]) // SELECT awaiting
    mockSqlResponses.push([]) // UPDATE recortes no afectó (borrado)
    mockSqlResponses.push([]) // clear
    const res = await consumeAwaitingDescription(getSql(), 'u1', '+569', 'algo')
    expect(res).toBeNull()
  })
})

describe('setAwaitingDescription', () => {
  it('marca el puntero awaiting_desc en whatsapp_links', async () => {
    mockSqlResponses.push([])
    await setAwaitingDescription(getSql(), '+569', 'u1', 'recorte', 'r1')
    const upd = mockSqlResponses.calls.find((c) =>
      /UPDATE whatsapp_links/i.test(c.template),
    )
    expect(upd?.template).toMatch(/awaiting_desc_kind/)
    expect(upd?.values).toContain('recorte')
  })
})
