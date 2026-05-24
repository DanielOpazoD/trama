import type { Momento } from '../../types'

/**
 * Helpers puros para Momentos. Sin React, sin queries — todo testeable
 * con vitest sin DOM. La idea es que MomentosView y sus sub-componentes
 * importen de acá para no duplicar lógica de fecha / agrupación.
 */

/**
 * Devuelve "hoy" si la fecha es hoy, "ayer" si es ayer, sino la fecha
 * completa en español (e.g. "domingo, 24 de mayo"). Si el año difiere
 * del actual, agrega el año.
 *
 * Diseñado como label de header de día en el timeline. Sin localización
 * adicional — Trama es app personal en español.
 */
export function formatDateHeading(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86_400_000)
  if (diffDays === 0) return 'hoy'
  if (diffDays === 1) return 'ayer'
  return d.toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: target.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  })
}

/**
 * Hora del día en formato 24h (HH:MM). Usado como gutter izquierdo de
 * cada entrada del timeline para que el ojo recorra verticalmente.
 */
export function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Agrupa una lista de momentos por día calendario (year-month-day).
 *
 * Asume que `items` ya viene ordenado descendente por capturedAt (el
 * endpoint los devuelve así). Como Map preserva orden de inserción,
 * el resultado mantiene el orden cronológico inverso natural.
 *
 * Items con capturedAt inválido se descartan silenciosamente — no nos
 * detenemos por uno corrupto.
 */
export function groupByDay(
  items: Momento[],
): Array<{ dayKey: string; entries: Momento[] }> {
  const groups = new Map<string, Momento[]>()
  for (const m of items) {
    const d = new Date(m.capturedAt)
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const arr = groups.get(key) ?? []
    arr.push(m)
    groups.set(key, arr)
  }
  return Array.from(groups.entries()).map(([dayKey, entries]) => ({
    dayKey,
    entries,
  }))
}

/**
 * Agrupa una lista de momentos por mes calendario (year-month).
 * Usado por la vista álbum para titular cada mes. Mismo contrato que
 * groupByDay: descarta capturedAt inválidos y respeta orden de input.
 */
export function groupByMonth(
  items: Momento[],
): Array<{ monthKey: string; entries: Momento[] }> {
  const groups = new Map<string, Momento[]>()
  for (const m of items) {
    const d = new Date(m.capturedAt)
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const arr = groups.get(key) ?? []
    arr.push(m)
    groups.set(key, arr)
  }
  return Array.from(groups.entries()).map(([monthKey, entries]) => ({
    monthKey,
    entries,
  }))
}

/**
 * Format de un monthKey "2026-05" → "mayo 2026" en español.
 */
export function formatMonthLabel(monthKey: string): string {
  const [year, monthNum] = monthKey.split('-')
  const y = Number(year)
  const m = Number(monthNum)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey
  return new Date(y, m - 1, 1).toLocaleDateString('es', {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Lee width/height de una imagen del lado del cliente sin recargarla
 * en otro request. Resuelve con {0,0} si la imagen falla a cargar — el
 * caller decide qué hacer (típicamente: guardar sin dimensiones y
 * mostrar sin aspect ratio explícito).
 *
 * NO es testeable fácilmente sin DOM real; el test cubre el camino
 * happy y nos confiamos del browser para el resto.
 */
export function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ width: 0, height: 0 })
    }
    img.src = url
  })
}
