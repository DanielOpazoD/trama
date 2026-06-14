import { describe, expect, it } from 'vitest'
import { formatStatus, relativeTime } from './status'

const NOW = new Date('2026-06-14T12:00:00Z')

describe('relativeTime', () => {
  it('formatea distancias humanas', () => {
    expect(relativeTime('2026-06-14T11:59:40Z', NOW)).toBe('recién')
    expect(relativeTime('2026-06-14T11:55:00Z', NOW)).toBe('hace 5 min')
    expect(relativeTime('2026-06-14T09:00:00Z', NOW)).toBe('hace 3 h')
    expect(relativeTime('2026-06-12T12:00:00Z', NOW)).toBe('hace 2 d')
  })
  it('fecha inválida → cadena vacía', () => {
    expect(relativeTime('no-fecha', NOW)).toBe('')
  })
})

describe('formatStatus', () => {
  it('vínculo activo + última captura + conteo', () => {
    const s = formatStatus(
      {
        verifiedAt: '2026-06-01T00:00:00Z',
        lastCaptureKind: 'note',
        lastCaptureAt: '2026-06-14T11:55:00Z',
        monthCount: 7,
      },
      NOW,
    )
    expect(s).toContain('Vínculo: activo ✅')
    expect(s).toContain('Última captura: nota (hace 5 min)')
    expect(s).toContain('deshacer')
    expect(s).toContain('Mensajes este mes: 7')
  })

  it('sin captura previa lo dice', () => {
    const s = formatStatus(
      {
        verifiedAt: '2026-06-01T00:00:00Z',
        lastCaptureKind: null,
        lastCaptureAt: null,
        monthCount: 0,
      },
      NOW,
    )
    expect(s).toContain('todavía nada')
    expect(s).not.toContain('deshacer')
  })

  it('vínculo pendiente', () => {
    const s = formatStatus(
      { verifiedAt: null, lastCaptureKind: null, lastCaptureAt: null, monthCount: 0 },
      NOW,
    )
    expect(s).toContain('pendiente')
  })
})
