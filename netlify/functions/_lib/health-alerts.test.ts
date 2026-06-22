import { describe, expect, it } from 'vitest'
import {
  BUDGET_CRITICAL_PCT,
  BUDGET_WARN_PCT,
  EMBEDDINGS_BACKLOG_MIN,
  ERRORS_CRITICAL_24H,
  ERRORS_WARN_24H,
  buildHealthAlerts,
  deriveHealthStatus,
  type HealthSignals,
} from './health-alerts'

/**
 * Tests de la lógica PURA de clasificación de alertas de salud.
 *
 * Cubrimos cada umbral en sus tres bandas (sin alerta / warn / critical),
 * la severidad resultante, el estado global derivado, y el contrato de
 * privacidad: las alertas no deben filtrar datos sensibles.
 */

/** Señales base: todo tranquilo, ninguna alerta debería dispararse. */
function quietSignals(overrides: Partial<HealthSignals> = {}): HealthSignals {
  return {
    budgetPct: 0,
    errors24h: 0,
    pendingEmbeddings: 0,
    clerkConfigured: false,
    legacyFallbackAllowed: false,
    ...overrides,
  }
}

describe('buildHealthAlerts — budget', () => {
  it('sin alerta por debajo del umbral warn', () => {
    const alerts = buildHealthAlerts(quietSignals({ budgetPct: BUDGET_WARN_PCT - 0.01 }))
    expect(alerts.find((a) => a.code.startsWith('budget'))).toBeUndefined()
  })

  it('warn entre el 70% y el 90%', () => {
    const alerts = buildHealthAlerts(quietSignals({ budgetPct: 0.75 }))
    const budget = alerts.find((a) => a.code === 'budget_high')
    expect(budget).toBeDefined()
    expect(budget!.severity).toBe('warn')
    // El label refleja el porcentaje redondeado, no datos sensibles.
    expect(budget!.label).toContain('75%')
  })

  it('justo en el umbral warn (0.7) dispara warn', () => {
    const alerts = buildHealthAlerts(quietSignals({ budgetPct: BUDGET_WARN_PCT }))
    expect(alerts.some((a) => a.code === 'budget_high' && a.severity === 'warn')).toBe(
      true,
    )
  })

  it('error a partir del 90%', () => {
    const alerts = buildHealthAlerts(quietSignals({ budgetPct: BUDGET_CRITICAL_PCT }))
    const budget = alerts.find((a) => a.code === 'budget_critical')
    expect(budget).toBeDefined()
    expect(budget!.severity).toBe('error')
  })

  it('al cruzar a critical no emite también el warn (mutuamente excluyentes)', () => {
    const alerts = buildHealthAlerts(quietSignals({ budgetPct: 0.95 }))
    expect(alerts.some((a) => a.code === 'budget_critical')).toBe(true)
    expect(alerts.some((a) => a.code === 'budget_high')).toBe(false)
  })
})

describe('buildHealthAlerts — errores 24h', () => {
  it('sin alerta por debajo del umbral warn', () => {
    const alerts = buildHealthAlerts(quietSignals({ errors24h: ERRORS_WARN_24H - 1 }))
    expect(alerts.find((a) => a.code.startsWith('errors'))).toBeUndefined()
  })

  it('warn entre 3 y 9 errores', () => {
    const alerts = buildHealthAlerts(quietSignals({ errors24h: 5 }))
    const err = alerts.find((a) => a.code === 'errors_recent')
    expect(err).toBeDefined()
    expect(err!.severity).toBe('warn')
    expect(err!.label).toContain('5')
  })

  it('error a partir de 10 errores', () => {
    const alerts = buildHealthAlerts(quietSignals({ errors24h: ERRORS_CRITICAL_24H }))
    const err = alerts.find((a) => a.code === 'errors_burst')
    expect(err).toBeDefined()
    expect(err!.severity).toBe('error')
  })

  it('en ráfaga emite solo el critical, no el warn', () => {
    const alerts = buildHealthAlerts(quietSignals({ errors24h: 42 }))
    expect(alerts.some((a) => a.code === 'errors_burst')).toBe(true)
    expect(alerts.some((a) => a.code === 'errors_recent')).toBe(false)
  })
})

describe('buildHealthAlerts — embeddings pendientes', () => {
  it('sin alerta por debajo del backlog mínimo', () => {
    const alerts = buildHealthAlerts(
      quietSignals({ pendingEmbeddings: EMBEDDINGS_BACKLOG_MIN - 1 }),
    )
    expect(alerts.find((a) => a.code === 'embeddings_pending')).toBeUndefined()
  })

  it('info a partir del backlog mínimo', () => {
    const alerts = buildHealthAlerts(
      quietSignals({ pendingEmbeddings: EMBEDDINGS_BACKLOG_MIN }),
    )
    const emb = alerts.find((a) => a.code === 'embeddings_pending')
    expect(emb).toBeDefined()
    expect(emb!.severity).toBe('info')
    expect(emb!.label).toContain(String(EMBEDDINGS_BACKLOG_MIN))
  })
})

describe('buildHealthAlerts — auth fallback', () => {
  it('no alerta en modo legacy puro (Clerk no configurado)', () => {
    const alerts = buildHealthAlerts(
      quietSignals({ clerkConfigured: false, legacyFallbackAllowed: true }),
    )
    expect(alerts.find((a) => a.code === 'auth_legacy_fallback')).toBeUndefined()
  })

  it('no alerta en modo Clerk estricto (sin fallback)', () => {
    const alerts = buildHealthAlerts(
      quietSignals({ clerkConfigured: true, legacyFallbackAllowed: false }),
    )
    expect(alerts.find((a) => a.code === 'auth_legacy_fallback')).toBeUndefined()
  })

  it('warn cuando Clerk está configurado pero el fallback legacy sigue activo', () => {
    const alerts = buildHealthAlerts(
      quietSignals({ clerkConfigured: true, legacyFallbackAllowed: true }),
    )
    const auth = alerts.find((a) => a.code === 'auth_legacy_fallback')
    expect(auth).toBeDefined()
    expect(auth!.severity).toBe('warn')
  })
})

describe('buildHealthAlerts — composición y orden', () => {
  it('sin señales problemáticas devuelve lista vacía', () => {
    expect(buildHealthAlerts(quietSignals())).toEqual([])
  })

  it('acumula varias alertas y las ordena por urgencia (budget primero)', () => {
    const alerts = buildHealthAlerts({
      budgetPct: 0.95,
      errors24h: 12,
      pendingEmbeddings: 100,
      clerkConfigured: true,
      legacyFallbackAllowed: true,
    })
    const codes = alerts.map((a) => a.code)
    expect(codes).toEqual([
      'budget_critical',
      'auth_legacy_fallback',
      'errors_burst',
      'embeddings_pending',
    ])
  })

  it('es pura: misma entrada produce misma salida', () => {
    const signals = quietSignals({ budgetPct: 0.8, errors24h: 4 })
    expect(buildHealthAlerts(signals)).toEqual(buildHealthAlerts(signals))
  })
})

describe('buildHealthAlerts — contrato de privacidad', () => {
  it('nunca filtra datos sensibles en label/hint aunque las señales lo sugieran', () => {
    // Las señales son numéricas/booleanas, pero verificamos defensivamente
    // que la salida serializada no contenga rastros de PII ni secretos:
    // ni emails, ni tokens, ni texto crudo de error.
    const alerts = buildHealthAlerts({
      budgetPct: 0.95,
      errors24h: 12,
      pendingEmbeddings: 100,
      clerkConfigured: true,
      legacyFallbackAllowed: true,
    })
    const serialized = JSON.stringify(alerts).toLowerCase()
    expect(serialized).not.toMatch(/@/) // ningún email
    expect(serialized).not.toMatch(/sk_|bearer|token=|password|jwt/)
    // El copy resume conteos ("12 errores en 24h"), nunca el contenido.
    expect(serialized).toContain('errores')
  })
})

describe('deriveHealthStatus', () => {
  it('ok cuando no hay alertas', () => {
    expect(deriveHealthStatus([])).toBe('ok')
  })

  it('degraded cuando hay warn/info pero ningún error', () => {
    expect(
      deriveHealthStatus([
        { severity: 'info', code: 'x', label: 'l', hint: 'h' },
        { severity: 'warn', code: 'y', label: 'l', hint: 'h' },
      ]),
    ).toBe('degraded')
  })

  it('critical cuando hay al menos una alerta error', () => {
    expect(
      deriveHealthStatus([
        { severity: 'info', code: 'x', label: 'l', hint: 'h' },
        { severity: 'error', code: 'z', label: 'l', hint: 'h' },
      ]),
    ).toBe('critical')
  })
})
