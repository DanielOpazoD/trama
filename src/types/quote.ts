import type { Origin } from './origin'

/**
 * Quote — fragmento textual atribuido a una entidad. Un párrafo de un libro,
 * algo que dijo una persona, un verso, etc.
 *
 * `linkedQuoteIds` son referencias soft (no FK) — borrar una cita NO
 * cascadea sus links. Eso es deliberado: las relaciones quedan pendientes
 * de reconciliar si el destino vuelve.
 */
export type Quote = {
  id: string
  entityId: string
  text: string
  source?: string
  context?: string
  /** Lo que el usuario pensó al guardar la cita. Su voz, distinta del texto. */
  userReflection?: string
  /** Interpretación generada por IA. Solo persistida si el usuario la guarda. */
  aiReflection?: string
  aiReflectionProvider?: string
  aiReflectionModel?: string
  aiReflectionAt?: string
  /** Refs soft a otras citas (no FK — borrar una NO cascadea limpieza). */
  linkedQuoteIds: string[]
  /** ω-E: timestamp de pin como favorita. undefined = no es favorita. */
  pinnedAt?: string
  origin: Origin
  createdAt: string
  updatedAt: string
}
