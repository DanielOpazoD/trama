import { describe, it, expect } from 'vitest'
import { seasonOf, seasonKeyString, formatSeason } from './season'

/**
 * Estaciones del hemisferio sur. Lo crítico son los bordes de mes y el
 * cruce de año del verano (diciembre cuenta como el verano del año
 * siguiente). Construimos las fechas con `new Date(y, mIdx, d)` — hora
 * local, igual que `seasonOf`, para que el test no dependa de la TZ del
 * runner.
 */
describe('seasonOf (hemisferio sur)', () => {
  it('cuenta diciembre como verano del año siguiente', () => {
    expect(seasonOf(new Date(2025, 11, 15))).toEqual({ season: 'verano', year: 2026 })
  })

  it('cuenta enero y febrero como verano del mismo año', () => {
    expect(seasonOf(new Date(2026, 0, 5))).toEqual({ season: 'verano', year: 2026 })
    expect(seasonOf(new Date(2026, 1, 28))).toEqual({ season: 'verano', year: 2026 })
  })

  it('mapea marzo–mayo a otoño', () => {
    expect(seasonOf(new Date(2026, 2, 1)).season).toBe('otoño')
    expect(seasonOf(new Date(2026, 4, 31)).season).toBe('otoño')
  })

  it('mapea junio–agosto a invierno', () => {
    expect(seasonOf(new Date(2026, 5, 1)).season).toBe('invierno')
    expect(seasonOf(new Date(2026, 7, 31)).season).toBe('invierno')
  })

  it('mapea septiembre–noviembre a primavera', () => {
    expect(seasonOf(new Date(2026, 8, 1)).season).toBe('primavera')
    expect(seasonOf(new Date(2026, 10, 30)).season).toBe('primavera')
  })
})

describe('seasonKeyString / formatSeason', () => {
  it('produce una clave estable', () => {
    expect(seasonKeyString({ season: 'verano', year: 2026 })).toBe('verano-2026')
  })

  it('formatea el encabezado capitalizado', () => {
    expect(formatSeason({ season: 'otoño', year: 2026 })).toBe('Otoño 2026')
    expect(formatSeason({ season: 'verano', year: 2026 })).toBe('Verano 2026')
  })
})
