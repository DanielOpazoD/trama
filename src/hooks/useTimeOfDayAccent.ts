import { useEffect } from 'react'

/**
 * δ6: Time-of-day accent — desplaza el accent-gold del CSS según la hora
 * local del usuario.
 *
 * Filosofía: Trama es un cuaderno, no un dashboard. Como un café que cambia
 * su iluminación a lo largo del día — más cálido por la mañana, más sombrío
 * al atardecer. El cambio es SUTIL, casi imperceptible en un solo momento,
 * pero el usuario que vuelve a la app a distintas horas siente que "respira".
 *
 * Ventana de cambio:
 *   06:00 – 11:00  → cobre cálido (mañana)
 *   11:00 – 17:00  → dorado base (mediodía, el default)
 *   17:00 – 21:00  → ámbar atardecer (cobrizo más oscuro)
 *   21:00 – 06:00  → lavanda azulado fría (noche)
 *
 * Estrategia técnica: mutamos la CSS variable --accent-gold via inline
 * style en el <html>. El cambio se propaga automático a todo lo que use
 * var(--accent-gold) (badges IA, ◆ una cita de tu trama, eyebrows oro, etc).
 * Re-evaluamos cada 30 min para que el cambio se note si el user deja la
 * app abierta por horas.
 */

type AccentShift = {
  /** Hora local del usuario (0–23) en que empieza este período. */
  hourStart: number
  /** Override del --accent-gold. */
  gold: string
  /** Override del --accent-gold-soft (rgba con opacity 0.10). */
  goldSoft: string
}

// Coordenadas HSL para razonar; los valores hex son aproximados.
const SHIFTS: AccentShift[] = [
  // 21:00 – 06:00 — noche, accent frío azulado-lavanda
  { hourStart: 21, gold: '#7a6b94', goldSoft: 'rgb(122 107 148 / 0.10)' },
  // 06:00 – 11:00 — mañana, cobre cálido
  { hourStart: 6, gold: '#a86f3c', goldSoft: 'rgb(168 111 60 / 0.10)' },
  // 11:00 – 17:00 — mediodía, el dorado base (mismo que CSS default)
  { hourStart: 11, gold: '#a07900', goldSoft: 'rgb(160 121 0 / 0.10)' },
  // 17:00 – 21:00 — atardecer, ámbar más oscuro
  { hourStart: 17, gold: '#9a5a2e', goldSoft: 'rgb(154 90 46 / 0.10)' },
]

function pickShift(hour: number): AccentShift {
  // Ordenamos por hourStart descendente y devolvemos el primero <= hour.
  // Wrap-around para 21:00–06:00 (la noche cruza medianoche).
  if (hour >= 21 || hour < 6) return SHIFTS[0]!
  if (hour < 11) return SHIFTS[1]!
  if (hour < 17) return SHIFTS[2]!
  return SHIFTS[3]!
}

export function useTimeOfDayAccent() {
  useEffect(() => {
    function apply() {
      const hour = new Date().getHours()
      const shift = pickShift(hour)
      const root = document.documentElement
      root.style.setProperty('--accent-gold', shift.gold)
      root.style.setProperty('--accent-gold-soft', shift.goldSoft)
    }
    apply()
    // Cada 30 min revaluamos por si el usuario deja Trama abierta cruzando
    // una frontera horaria (e.g. de la tarde a la noche).
    const interval = setInterval(apply, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])
}
