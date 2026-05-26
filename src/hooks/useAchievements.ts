import { useEffect, useRef } from 'react'
import { useToast } from '../state'

/**
 * δ7: Achievement moments — un toast efímero estilizado cuando cruzás un
 * umbral significativo. No es gamification: no hay puntos, no hay badges
 * permanentes. Es solo un guiño editorial de "esto que estás haciendo
 * vale la pena", anclado en momentos cuantitativos reales.
 *
 * Filosofía: una trama de 100 entidades no es un score, es una biografía
 * mínima. Trama lo nota una vez, te lo dice con respeto tipográfico,
 * y desaparece. Si llegás a 200, te lo dice de nuevo (en distinto umbral).
 * Si nunca llegás, nunca aparece — sin loops vacíos.
 *
 * Umbrales: 10, 25, 50, 100, 250, 500, 1000 (luego cada 1000).
 *   - Para entidades, citas, relaciones independientemente.
 *
 * Persistencia: localStorage 'trama:achievements-seen' — un array de
 * keys vistos (e.g. 'entities-100'). Una vez visto, no se repite.
 *
 * Reactive: el hook escucha los counts en cada render. Solo dispara
 * cuando un count cruza un umbral nuevo (greater-than el último cached).
 */

const STORAGE_KEY = 'trama:achievements-seen'
const THRESHOLDS = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10_000]

type Counts = {
  entities: number
  quotes: number
  relationships: number
}

type Achievement = {
  key: string
  message: string
}

function readSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr) : new Set()
  } catch {
    return new Set()
  }
}

function writeSeen(set: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)))
  } catch {
    /* localStorage disabled */
  }
}

function pickMessage(kind: 'entities' | 'quotes' | 'relationships', n: number): string {
  // Mensajes editoriales — no porcentajes, no gamification. Cada uno una
  // pequeña reflexión sobre QUÉ implica ese número.
  if (kind === 'entities') {
    if (n === 10) return '✦ diez entidades. la trama empieza a tener forma.'
    if (n === 25) return '✦ veinticinco. ya cabe una vida adentro.'
    if (n === 50) return '✦ cincuenta entidades — la mitad de una biblioteca íntima.'
    if (n === 100) return '✦ cien. ya cuenta una historia.'
    if (n === 250) return '✦ doscientas cincuenta. tu trama tiene capítulos.'
    if (n === 500) return '✦ quinientas. esto es un atlas, ya no un cuaderno.'
    if (n === 1000) return '✦ mil entidades. una biblioteca real.'
    return `✦ ${n.toLocaleString('es')} entidades.`
  }
  if (kind === 'quotes') {
    if (n === 10) return '✦ diez citas. lo que retenés empieza a hablarte.'
    if (n === 25) return '✦ veinticinco frases que se quedaron.'
    if (n === 50) return '✦ cincuenta citas. un florilegio propio.'
    if (n === 100) return '✦ cien fragmentos. esto es lo que viste.'
    if (n === 250) return '✦ doscientas cincuenta citas — una antología.'
    if (n === 500) return '✦ quinientas. ya puedes releerte como autor.'
    if (n === 1000) return '✦ mil citas. archivo de una conciencia.'
    return `✦ ${n.toLocaleString('es')} citas.`
  }
  // relationships
  if (n === 10) return '✦ diez relaciones. los hilos se notan.'
  if (n === 25) return '✦ veinticinco vínculos entre cosas tuyas.'
  if (n === 50) return '✦ cincuenta relaciones. ya hay un mapa real.'
  if (n === 100) return '✦ cien líneas. tu trama es un grafo, no una lista.'
  if (n === 250) return '✦ doscientas cincuenta. cada nodo tiene vecinos.'
  if (n === 500) return '✦ quinientas relaciones. una red de afinidades.'
  if (n === 1000) return '✦ mil hilos. la trama te conoce mejor.'
  return `✦ ${n.toLocaleString('es')} relaciones.`
}

function detectAchievements(counts: Counts, seen: Set<string>): Achievement[] {
  const fresh: Achievement[] = []
  for (const [k, n] of Object.entries(counts) as Array<[keyof Counts, number]>) {
    for (const t of THRESHOLDS) {
      if (n >= t) {
        const key = `${k}-${t}`
        if (!seen.has(key)) {
          fresh.push({ key, message: pickMessage(k, t) })
        }
      }
    }
  }
  return fresh
}

export function useAchievements(counts: Counts): void {
  const toast = useToast()
  // Ref para evitar re-disparar en el mismo render-cycle o cuando React
  // re-renderea con los mismos counts. La fuente de verdad es localStorage.
  const seenRef = useRef<Set<string>>(readSeen())

  useEffect(() => {
    // Si los counts están en 0, probablemente data no cargó todavía — skip.
    // Sin esto, en el primer render con data llegando 0,0,0 marcaríamos
    // umbrales de 0 que después subirían a sus valores reales — el patrón
    // "crossover" se rompe.
    const total = counts.entities + counts.quotes + counts.relationships
    if (total === 0) return

    const fresh = detectAchievements(counts, seenRef.current)
    if (fresh.length === 0) return

    // Disparamos UN solo toast a la vez. Si hay múltiples umbrales nuevos
    // (ej. import masivo que cruza varios), mostramos el mayor; los demás
    // los grabamos como vistos sin notificar — no queremos spammear.
    const winner = fresh[fresh.length - 1] // el último es el de número más alto
    if (!winner) return
    const next = new Set(seenRef.current)
    for (const a of fresh) next.add(a.key)
    seenRef.current = next
    writeSeen(next)

    toast.show({
      message: winner.message,
      // λ6: tone 'achievement' usa el backplate gold cálido del ToastHost
      // — distinto de 'success' (verde de undo/save) para que el momento
      // editorial se sienta como un evento, no como una confirmación.
      tone: 'achievement',
      durationMs: 6000,
    })
  }, [counts.entities, counts.quotes, counts.relationships, toast])
}
