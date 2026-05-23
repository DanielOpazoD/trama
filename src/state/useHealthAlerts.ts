import { useQuery } from '@tanstack/react-query'
import { api, type HealthAlert } from '../api'

/**
 * Polea /api/health cada 60s y devuelve el array de alertas activas.
 *
 * El endpoint health calcula alertas en runtime (budget, errores 24h,
 * embeddings pendientes). Este hook solo expone la lista y la severidad
 * máxima — la UI decide el indicador visual (un dot en sidebar de
 * configuración, p.ej.).
 *
 * Diseño: si el endpoint falla, devolvemos lista vacía. Es mejor no
 * mostrar un dot que mostrar uno falso. Si hay errores reales se van
 * a manifestar en otros lugares (toast, Settings → Estado).
 */

export type HealthAlertSummary = {
  alerts: HealthAlert[]
  /** La mayor severidad presente, o null si no hay alertas. */
  maxSeverity: 'info' | 'warn' | 'error' | null
  /** Total de alertas en cualquier severidad. */
  count: number
}

function maxSeverity(alerts: HealthAlert[]): HealthAlertSummary['maxSeverity'] {
  if (alerts.some((a) => a.severity === 'error')) return 'error'
  if (alerts.some((a) => a.severity === 'warn')) return 'warn'
  if (alerts.some((a) => a.severity === 'info')) return 'info'
  return null
}

export function useHealthAlerts(): HealthAlertSummary {
  const { data } = useQuery({
    queryKey: ['health', 'alerts'],
    queryFn: () => api.getHealth(),
    // Refetch cada 60s — los thresholds son lentos (budget mensual,
    // errores en 24h). No tiene sentido pulsear más rápido.
    refetchInterval: 60_000,
    // Si el endpoint falla, no spammeamos reintentos. Volverá a probar
    // en el próximo interval.
    retry: false,
    // No bloquear con loading state; el dot solo aparece cuando hay data.
    staleTime: 30_000,
  })

  const alerts = data?.alerts ?? []
  return {
    alerts,
    maxSeverity: maxSeverity(alerts),
    count: alerts.length,
  }
}
