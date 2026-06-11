/**
 * Separadores de sesión del chat: cuando un hilo se retoma OTRO día, la
 * conversación lo marca con una línea editorial — «· retomado el jueves ·» —
 * en vez de fingir que todo pasó en una sola sentada. El hilo deja de ser
 * un log y empieza a tener capítulos.
 */

/** Días de calendario (no de 24h) entre dos fechas, en hora local. */
function calendarDayDiff(a: Date, b: Date): number {
  const dayA = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const dayB = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((dayB.getTime() - dayA.getTime()) / 86_400_000)
}

/**
 * Etiqueta del separador entre dos mensajes consecutivos, o null si no
 * corresponde (primer mensaje, mismo día, fechas inválidas).
 *
 *  - hoy                → «retomado hoy»
 *  - misma semana (<7d) → «retomado el jueves»
 *  - más viejo          → «retomado el 12 de mayo» (+ año si es otro año)
 */
export function sessionBreakLabel(
  prevIso: string | undefined | null,
  currIso: string | undefined | null,
  now: Date = new Date(),
): string | null {
  if (!prevIso || !currIso) return null
  const prev = new Date(prevIso)
  const curr = new Date(currIso)
  if (Number.isNaN(prev.getTime()) || Number.isNaN(curr.getTime())) return null
  if (calendarDayDiff(prev, curr) <= 0) return null

  if (calendarDayDiff(curr, now) === 0) return 'retomado hoy'
  if (calendarDayDiff(curr, now) < 7) {
    const weekday = curr.toLocaleDateString('es', { weekday: 'long' })
    return `retomado el ${weekday}`
  }
  const sameYear = curr.getFullYear() === now.getFullYear()
  const date = curr.toLocaleDateString(
    'es',
    sameYear
      ? { day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'long', year: 'numeric' },
  )
  return `retomado el ${date}`
}
