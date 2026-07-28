import { useEffect } from 'react'

/**
 * δ6: Time-of-day accent — el `--accent-gold` respira con la hora local.
 *
 * Filosofía: Trama es un cuaderno, no un dashboard. Como un café que cambia su
 * iluminación a lo largo del día — más cálido por la mañana, más sombrío al
 * atardecer. El cambio es SUTIL, casi imperceptible en un solo momento, pero el
 * usuario que vuelve a la app a distintas horas siente que "respira".
 *
 * Ventanas:
 *   06:00 – 11:00  → cobre cálido (mañana)
 *   11:00 – 17:00  → dorado (mediodía)
 *   17:00 – 21:00  → ámbar de atardecer
 *   21:00 – 06:00  → lavanda fría (noche)
 *
 * ESTRATEGIA: este hook publica **cuándo**, no **qué color**.
 *
 * Antes escribía el hex directamente en `document.documentElement.style`, y ese
 * inline ganaba a los tres temas. El resultado: un oro afinado para papel blanco
 * se aplicaba también sobre el papel casi negro de noche y vela. Medido sobre el
 * eyebrow serif, vela pasaba de 9.74:1 con su propio oro a **3.37:1** con el
 * ámbar del atardecer — por debajo de WCAG AA, y con el agravante de que
 * dependía de la hora a la que mirases.
 *
 * Ahora sólo pone `data-accent-hour` en el `<html>` y la paleta vive donde debe:
 * en `index.css`, junto a los demás tokens de cada tema. Es además lo que pide
 * la convención del proyecto — "los temas viven en las CSS vars de `:root` /
 * `html.dark` / `html.dark.theme-vela`" —, que escribir color desde JS rompía.
 *
 * La hora mueve el TONO (el ánimo); el tema decide la LUMINOSIDAD (la
 * legibilidad sobre su papel). Las dos intenciones dejan de pelearse.
 */

/** Períodos del día. El valor viaja tal cual a `data-accent-hour`. */
export type AccentHour = 'mañana' | 'mediodia' | 'atardecer' | 'noche'

export function pickAccentHour(hour: number): AccentHour {
  if (hour >= 21 || hour < 6) return 'noche'
  if (hour < 11) return 'mañana'
  if (hour < 17) return 'mediodia'
  return 'atardecer'
}

export function useTimeOfDayAccent() {
  useEffect(() => {
    function apply() {
      document.documentElement.dataset.accentHour = pickAccentHour(new Date().getHours())
    }
    apply()
    // Cada 30 min por si la app queda abierta cruzando una frontera horaria.
    const interval = setInterval(apply, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])
}
