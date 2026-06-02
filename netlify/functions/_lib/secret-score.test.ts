import { describe, expect, it } from 'vitest'
import { assessSecretHealth } from './secret-score'

describe('assessSecretHealth', () => {
  it('marca una clave crítica vencida como riesgo alto', () => {
    expect(
      assessSecretHealth({
        critical: true,
        expiresAt: '2026-05-01',
        lastRotatedAt: '2025-01-01',
        now: '2026-06-01',
      }),
    ).toEqual({
      level: 'high',
      score: 30,
      flags: ['vencida', 'critica', 'rotacion-pendiente'],
    })
  })

  it('marca una clave reciente y no crítica como sana', () => {
    expect(
      assessSecretHealth({
        critical: false,
        expiresAt: '2026-12-01',
        lastRotatedAt: '2026-05-01',
        now: '2026-06-01',
      }),
    ).toEqual({
      level: 'healthy',
      score: 100,
      flags: [],
    })
  })
})
