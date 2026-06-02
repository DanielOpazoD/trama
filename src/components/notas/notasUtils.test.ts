import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Secret } from '../../api'
import { formatShortDate, secretHealth } from './notasUtils'

const baseSecret: Secret = {
  id: 's1',
  label: 'OpenAI',
  kind: 'api_key',
  service: 'OpenAI',
  username: null,
  notes: null,
  favorite: false,
  critical: false,
  expiresAt: null,
  lastRotatedAt: '2026-05-10',
  copiedAt: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-02T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('notasUtils', () => {
  it('formatea fechas cortas y tolera valores vacíos', () => {
    expect(formatShortDate('2026-06-02T04:00:00.000Z')).toContain('2')
    expect(formatShortDate(null)).toBe('')
  })

  it('califica una clave saludable sin flags', () => {
    expect(secretHealth(baseSecret)).toEqual({
      level: 'healthy',
      score: 100,
      flags: [],
    })
  })

  it('marca claves vencidas, críticas y sin rotación como alto riesgo', () => {
    expect(
      secretHealth({
        ...baseSecret,
        critical: true,
        expiresAt: '2026-05-01',
        lastRotatedAt: null,
      }),
    ).toEqual({
      level: 'high',
      score: 25,
      flags: ['vencida', 'crítica', 'sin rotación'],
    })
  })

  it('marca claves próximas a vencer como observación', () => {
    const health = secretHealth({
      ...baseSecret,
      expiresAt: '2026-06-20',
    })

    expect(health.level).toBe('watch')
    expect(health.score).toBe(80)
    expect(health.flags).toEqual(['vence pronto'])
  })

  it('detecta rotación pendiente en claves antiguas', () => {
    const health = secretHealth({
      ...baseSecret,
      lastRotatedAt: '2025-01-01',
    })

    expect(health.level).toBe('healthy')
    expect(health.score).toBe(85)
    expect(health.flags).toEqual(['rotación pendiente'])
  })
})
