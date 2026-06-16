import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockSqlResponses, setupMockSql } from '../test-utils'

vi.mock('../db.js', () => setupMockSql())

import { getSql } from '../db.js'
import { persistWhatsAppEvent, readWhatsAppMetrics } from './events'

beforeEach(() => mockSqlResponses.reset())

describe('persistWhatsAppEvent', () => {
  it('inserta el evento con sus campos', async () => {
    mockSqlResponses.push([])
    await persistWhatsAppEvent(getSql(), 'u1', {
      event: 'capture',
      kind: 'recorte',
      ok: true,
    })
    const ins = mockSqlResponses.calls.find((c) =>
      /INSERT INTO whatsapp_events/i.test(c.template),
    )
    expect(ins?.values).toContain('capture')
    expect(ins?.values).toContain('recorte')
  })

  it('acota el detalle a 500 caracteres', async () => {
    mockSqlResponses.push([])
    await persistWhatsAppEvent(getSql(), 'u1', {
      event: 'capture',
      ok: false,
      detail: 'x'.repeat(900),
    })
    const ins = mockSqlResponses.calls.find((c) =>
      /INSERT INTO whatsapp_events/i.test(c.template),
    )
    const detail = ins?.values.find((v) => typeof v === 'string' && v.startsWith('x'))
    expect((detail as string).length).toBe(500)
  })
})

describe('readWhatsAppMetrics', () => {
  it('agrega totales, por ruta, por evento y feed reciente', async () => {
    mockSqlResponses.push([{ event: 'capture', ok: 16, failed: 2 }]) // byEvent
    mockSqlResponses.push([
      { kind: 'recorte', count: 7 },
      { kind: 'momento', count: 5 },
    ]) // byKind
    mockSqlResponses.push([{ day: '2026-06-15', count: 9, failed: 1 }]) // daily
    mockSqlResponses.push([
      {
        event: 'capture',
        kind: 'momento',
        ok: true,
        detail: null,
        created_at: '2026-06-16T00:00:00.000Z',
      },
    ]) // recent

    const m = await readWhatsAppMetrics(getSql(), 'u1', 30)
    expect(m.total).toBe(18)
    expect(m.ok).toBe(16)
    expect(m.failed).toBe(2)
    expect(m.byKind[0]).toEqual({ kind: 'recorte', count: 7 })
    expect(m.recent[0]).toEqual({
      event: 'capture',
      kind: 'momento',
      ok: true,
      detail: null,
      createdAt: '2026-06-16T00:00:00.000Z',
    })
  })

  it('sin eventos → total 0', async () => {
    mockSqlResponses.push([]) // byEvent
    mockSqlResponses.push([]) // byKind
    mockSqlResponses.push([]) // daily
    mockSqlResponses.push([]) // recent
    const m = await readWhatsAppMetrics(getSql(), 'u1', 30)
    expect(m.total).toBe(0)
    expect(m.byKind).toEqual([])
  })
})
