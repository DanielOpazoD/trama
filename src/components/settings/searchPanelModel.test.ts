import { describe, expect, it } from 'vitest'
import { buildReindexProgress } from './searchPanelModel'

describe('searchPanelModel', () => {
  it('describe estado vacío cuando todavía no hay conteo de pendientes', () => {
    expect(
      buildReindexProgress({
        pending: null,
        running: false,
        runStartTotal: 0,
        runProcessed: 0,
      }),
    ).toEqual({
      totalPending: null,
      progressMax: 1,
      progressValue: 0,
      isComplete: false,
    })
  })

  it('deriva progreso estable mientras corre el reindexado', () => {
    expect(
      buildReindexProgress({
        pending: { entities: 1, quotes: 2 },
        running: true,
        runStartTotal: 10,
        runProcessed: 4,
      }),
    ).toEqual({
      totalPending: 3,
      progressMax: 10,
      progressValue: 4,
      isComplete: false,
    })
  })

  it('marca completado cuando no quedan pendientes', () => {
    expect(
      buildReindexProgress({
        pending: { entities: 0, quotes: 0 },
        running: false,
        runStartTotal: 10,
        runProcessed: 10,
      }),
    ).toEqual({
      totalPending: 0,
      progressMax: 10,
      progressValue: 10,
      isComplete: true,
    })
  })
})
