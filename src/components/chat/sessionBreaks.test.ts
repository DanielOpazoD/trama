import { describe, it, expect } from 'vitest'
import { sessionBreakLabel } from './sessionBreaks'

// `now` fijo para que los labels relativos sean determinísticos.
// 2026-06-11 es jueves.
const NOW = new Date('2026-06-11T15:00:00')

describe('sessionBreakLabel', () => {
  it('null sin mensaje previo (el hilo no "se retoma" al nacer)', () => {
    expect(sessionBreakLabel(undefined, '2026-06-11T10:00:00', NOW)).toBeNull()
    expect(sessionBreakLabel(null, '2026-06-11T10:00:00', NOW)).toBeNull()
  })

  it('null dentro del mismo día de calendario', () => {
    expect(
      sessionBreakLabel('2026-06-11T08:00:00', '2026-06-11T23:30:00', NOW),
    ).toBeNull()
  })

  it('null con fechas inválidas', () => {
    expect(sessionBreakLabel('no-fecha', '2026-06-11T10:00:00', NOW)).toBeNull()
    expect(sessionBreakLabel('2026-06-10T10:00:00', 'tampoco', NOW)).toBeNull()
  })

  it('«retomado hoy» cuando se retoma el mismo día que se mira', () => {
    expect(sessionBreakLabel('2026-06-09T22:00:00', '2026-06-11T09:00:00', NOW)).toBe(
      'retomado hoy',
    )
  })

  it('día de la semana dentro de la última semana', () => {
    // Retomado el martes 9, mirando el jueves 11 → «retomado el martes».
    expect(sessionBreakLabel('2026-06-08T22:00:00', '2026-06-09T09:00:00', NOW)).toBe(
      'retomado el martes',
    )
  })

  it('fecha completa cuando es más viejo que una semana', () => {
    expect(sessionBreakLabel('2026-05-10T10:00:00', '2026-05-12T10:00:00', NOW)).toBe(
      'retomado el 12 de mayo',
    )
  })

  it('agrega el año cuando cruza de año', () => {
    expect(sessionBreakLabel('2025-12-30T10:00:00', '2025-12-31T10:00:00', NOW)).toBe(
      'retomado el 31 de diciembre de 2025',
    )
  })

  it('null si el "siguiente" es anterior (orden defensivo)', () => {
    expect(
      sessionBreakLabel('2026-06-11T10:00:00', '2026-06-10T10:00:00', NOW),
    ).toBeNull()
  })
})
