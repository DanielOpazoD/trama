import { useEffect } from 'react'
import type { Entity, Quote } from '../types'

/**
 * δ7: Hilo-of-the-day — una vez por día, computa una frase basada en
 * algún aniversario real de tu trama. La frase se cachea en localStorage
 * para que el splash de la próxima carga la lea (el splash corre antes
 * que las queries, no puede computar esto in-line).
 *
 * Tipos de aniversario detectados, en orden de prioridad:
 *   1. Entidad/cita creada exactamente hace N años (N >= 1) → más memorable
 *   2. Mes con la mayor concentración de creaciones del año pasado
 *   3. (fallback) sin aniversario; se borra la cache para que el splash
 *      vuelva a aforismo random.
 *
 * Se ejecuta una vez al día (compara contra 'trama:hilo-date' guardado);
 * no recomputa en cada mount.
 */

const DATE_KEY = 'trama:hilo-date'
const TEXT_KEY = 'trama:hilo-text'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isAnniversary(
  createdAt: string,
  today: Date,
): { yearsAgo: number } | null {
  // Anniversary = mismo mes/día, al menos 1 año más viejo. Si hoy es
  // 23 de mayo y la entidad fue creada el 23 de mayo del año pasado,
  // es aniversario. Si fue creada hoy, NO (sería de hoy, no de antes).
  const c = new Date(createdAt)
  if (isNaN(c.getTime())) return null
  if (c.getMonth() !== today.getMonth()) return null
  if (c.getDate() !== today.getDate()) return null
  const yearsAgo = today.getFullYear() - c.getFullYear()
  if (yearsAgo < 1) return null
  return { yearsAgo }
}

export function describeYears(n: number): string {
  if (n === 1) return 'hace exactamente un año'
  if (n === 2) return 'hace dos años'
  if (n === 3) return 'hace tres años'
  return `hace ${n} años`
}

function pickAnniversaryText(entities: Entity[], quotes: Quote[]): string | null {
  const today = new Date()

  // Buscamos en quotes primero — son los aniversarios más emotivos
  // ("hace un año guardaste esta frase").
  for (const q of quotes) {
    const ann = isAnniversary(q.createdAt, today)
    if (ann) {
      const ent = entities.find((e) => e.id === q.entityId)
      const head = describeYears(ann.yearsAgo)
      if (ent) {
        return `${head} guardaste una cita de ${ent.name}`
      }
      return `${head} guardaste una cita`
    }
  }
  // Luego entities — un aniversario menos íntimo pero todavía válido.
  for (const e of entities) {
    const ann = isAnniversary(e.createdAt, today)
    if (ann) {
      const head = describeYears(ann.yearsAgo)
      return `${head} ${e.name} entró a tu trama`
    }
  }
  return null
}

export function useHiloOfTheDay(entities: Entity[], quotes: Quote[]): void {
  useEffect(() => {
    // Skip si data no cargó.
    if (entities.length === 0 && quotes.length === 0) return

    const date = todayISO()
    let lastDate: string | null = null
    try {
      lastDate = window.localStorage.getItem(DATE_KEY)
    } catch {
      /* localStorage disabled */
    }
    // Si ya computamos para hoy, no recomputamos. La cache se reaprovecha.
    if (lastDate === date) return

    const text = pickAnniversaryText(entities, quotes)
    try {
      window.localStorage.setItem(DATE_KEY, date)
      if (text) {
        window.localStorage.setItem(TEXT_KEY, text)
      } else {
        // Hoy no hay aniversario; limpiamos cualquier texto viejo así
        // el splash vuelve a aforismo random.
        window.localStorage.removeItem(TEXT_KEY)
      }
    } catch {
      /* localStorage disabled */
    }
  }, [entities, quotes])
}

/**
 * Lee el hilo cacheado para HOY (si existe). Devuelve null si la cache
 * está de otro día o no hay aniversario. Usado por el Splash.
 */
export function readHiloOfTheDay(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const date = window.localStorage.getItem(DATE_KEY)
    if (date !== todayISO()) return null
    return window.localStorage.getItem(TEXT_KEY)
  } catch {
    return null
  }
}
