import { useEffect, useState } from 'react'
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
 *
 * Acknowledgment: cuando el user abre Configuración, llamamos a
 * `acknowledgeHealthAlerts(codes)` con los códigos visibles en ese
 * momento. Persiste el set en localStorage. El hook expone `unseen`
 * con sólo los códigos NO acknowledged — eso es lo que la sidebar usa
 * para decidir si pintar el dot. Si llega un alert con un code nuevo
 * (e.g. "embeddings-pending" después de errores), vuelve a aparecer.
 */

const ACK_STORAGE_KEY = 'trama:health-alerts-acknowledged'

function readAcknowledged(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(ACK_STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

/**
 * Llamar cuando el user abre Settings — marca todos los códigos pasados
 * como acknowledged. Si en el futuro aparece un code nuevo, el dot vuelve.
 *
 * Reemplaza el set completo en vez de hacer union: si una alerta dejó de
 * estar activa (e.g. ya no hay errores 24h) y luego reaparece, queremos
 * que vuelva a notificar.
 */
export function acknowledgeHealthAlerts(codes: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(codes))
    // Notificar a las instancias del hook en la misma tab — localStorage
    // 'storage' event solo dispara en otras tabs, así que usamos un event
    // custom para forzar re-render local.
    window.dispatchEvent(new Event('trama:health-ack'))
  } catch {
    /* localStorage disabled */
  }
}

export type HealthAlertSummary = {
  alerts: HealthAlert[]
  /** Códigos no acknowledged. Es lo que dispara el dot. */
  unseenCodes: string[]
  /** La mayor severidad de las alertas no acknowledged. */
  maxSeverity: 'info' | 'warn' | 'error' | null
  /** Total de alertas no acknowledged. */
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

  // Acknowledged codes — se rerendea cuando alguien llama
  // acknowledgeHealthAlerts() (via custom event).
  const [acknowledged, setAcknowledged] = useState<Set<string>>(readAcknowledged)
  useEffect(() => {
    function refresh() {
      setAcknowledged(readAcknowledged())
    }
    window.addEventListener('trama:health-ack', refresh)
    // 'storage' viaja entre tabs; útil si el user abre Settings en otra ventana.
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('trama:health-ack', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const alerts = data?.alerts ?? []
  // Alertas cuyo código todavía no fue visto por el user — son las que
  // disparan la atención visual.
  const unseenAlerts = alerts.filter((a) => !acknowledged.has(a.code))

  return {
    alerts,
    unseenCodes: unseenAlerts.map((a) => a.code),
    maxSeverity: maxSeverity(unseenAlerts),
    count: unseenAlerts.length,
  }
}
