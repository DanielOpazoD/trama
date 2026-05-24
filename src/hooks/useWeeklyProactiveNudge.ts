import { useEffect, useRef } from 'react'
import { useToast, useProactiveQuery } from '../state'

/**
 * κ2: nudge semanal — UN toast suave por semana cuando hay sugerencias
 * proactivas pendientes que el usuario nunca abrió. Si las miró y las
 * resolvió, el hook se queda callado hasta que la próxima ronda genere
 * nuevas.
 *
 * Filosofía: no es notificación, es marginalia. Aparece como un susurro
 * tipográfico abajo, una sola vez por semana, y se va si el usuario lo
 * ignora. No vuelve mañana, no vibra, no pone badges en el sidebar.
 *
 * Triggers (todos deben cumplirse):
 *   - Pasaron >= 7 días desde el último nudge (o nunca hubo uno).
 *   - Hay >= 1 sugerencia con status='pending'.
 *   - La query ya terminó (no estamos en isLoading).
 *
 * Cuando se dispara:
 *   - Toast con mensaje "tienes N propuestas esperando" + acción "Ver".
 *   - Se persiste la fecha en localStorage 'trama:proactive-last-nudge'.
 *   - El click en "Ver" llama onNavigate(); luego el toast se cierra solo.
 *
 * NO genera sugerencias automáticamente — eso sigue siendo gesto manual
 * desde ProactiveView ("pedir ronda"). Acá sólo refloramos lo que ya existe.
 */

const STORAGE_KEY = 'trama:proactive-last-nudge'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function readLastNudge(): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return 0
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

function writeLastNudge(ts: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, String(ts))
  } catch {
    /* localStorage disabled */
  }
}

export function useWeeklyProactiveNudge({
  onNavigate,
}: {
  onNavigate: () => void
}): void {
  const toast = useToast()
  const query = useProactiveQuery()
  // Ref para asegurarnos de no disparar dos veces en el mismo render-cycle
  // (React StrictMode hace doble-mount; el hook debe ser idempotente).
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current) return
    if (query.isLoading || query.isError) return
    const pending = query.data ?? []
    if (pending.length === 0) return

    const last = readLastNudge()
    const now = Date.now()
    if (last > 0 && now - last < WEEK_MS) return

    firedRef.current = true
    writeLastNudge(now)

    const n = pending.length
    const message =
      n === 1
        ? 'Tienes 1 propuesta de la IA esperando que la mires.'
        : `Tienes ${n} propuestas de la IA esperando que las mires.`

    toast.show({
      message,
      tone: 'default',
      durationMs: 8000,
      action: {
        label: 'Ver',
        onAction: () => {
          onNavigate()
        },
      },
    })
  }, [query.data, query.isLoading, query.isError, toast, onNavigate])
}
