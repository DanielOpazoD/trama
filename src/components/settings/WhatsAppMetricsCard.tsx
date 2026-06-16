import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import { queryKeys } from '../../state/queryClient'

/** Etiqueta legible del destino de una captura. */
const KIND_LABEL: Record<string, string> = {
  note: 'Notas',
  recorte: 'Recortes',
  momento: 'Momentos',
  quote: 'Citas',
  entity: 'Entidades',
  task: 'Tareas',
}

/** Etiqueta legible de una categoría de evento (para el feed reciente). */
const EVENT_LABEL: Record<string, string> = {
  capture: 'Captura',
  media: 'Imagen',
  vision: 'Visión',
  transcription: 'Voz',
  recall: 'Consulta',
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'recién'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  return `hace ${Math.round(hrs / 24)} d`
}

const DAYS = 30

/**
 * Panel de observabilidad del módulo WhatsApp: capturas por ruta + tasa de
 * fallas + actividad reciente (últimos 30 días). Lee `/api/whatsapp-metrics`.
 * Discreto: si todavía no hay actividad, no se muestra.
 */
export function WhatsAppMetricsCard() {
  const metrics = useQuery({
    queryKey: queryKeys.whatsappMetrics(DAYS),
    queryFn: () => api.getWhatsAppMetrics(DAYS),
    staleTime: 60_000,
  })

  const m = metrics.data
  if (!m || m.total === 0) return null

  const failRate = m.total > 0 ? Math.round((m.failed / m.total) * 100) : 0
  const maxKind = Math.max(1, ...m.byKind.map((k) => k.count))

  return (
    <div className="rounded-lg border border-ink-100/70 bg-paper-100/40 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-micro uppercase tracking-eyebrow text-ink-300">
          Actividad · últimos {m.days} días
        </p>
        <p className="text-micro tabular-nums text-ink-300">
          {m.total} {m.total === 1 ? 'captura' : 'capturas'}
          {m.failed > 0 && (
            <span className="text-[color:var(--accent-clay)]"> · {failRate}% fallas</span>
          )}
        </p>
      </div>

      {/* Capturas por ruta — barras discretas. */}
      {m.byKind.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {m.byKind.map((k) => (
            <li key={k.kind} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-caption text-ink-600">
                {KIND_LABEL[k.kind] ?? k.kind}
              </span>
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-ink-100/50">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--accent-primary)] opacity-80"
                  style={{ width: `${Math.round((k.count / maxKind) * 100)}%` }}
                />
              </span>
              <span className="w-7 shrink-0 text-right text-micro tabular-nums text-ink-400">
                {k.count}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Actividad reciente — feed breve. */}
      {m.recent.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-ink-100/50 pt-2.5">
          {m.recent.slice(0, 5).map((e, i) => (
            <li
              key={`${e.createdAt}:${i}`}
              className="flex items-center gap-2 text-micro text-ink-400"
            >
              <span
                aria-hidden
                className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                  e.ok ? 'bg-[color:var(--accent-sage)]' : 'bg-[color:var(--accent-clay)]'
                }`}
              />
              <span className="truncate">
                {EVENT_LABEL[e.event] ?? e.event}
                {e.kind ? ` → ${KIND_LABEL[e.kind] ?? e.kind}` : ''}
                {!e.ok && ' · falló'}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-ink-300">
                {relTime(e.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
