/**
 * Reciprocal Rank Fusion (Cormack et al. 2009).
 *
 * Merge dos (o más) listas rankeadas en una sola lista usando la suma
 * de pesos recíprocos del rank en cada lista. No depende de las escalas
 * de score originales — solo de la POSICIÓN.
 *
 * k=60 es el valor del paper original; suaviza el efecto del top-1 sin
 * borrarlo del todo.
 */

const DEFAULT_K = 60

export type Ranked<T> = { id: string; item: T }

export type FusionEntry<T> = {
  id: string
  item: T
  score: number
  /** 1-indexed rank en la primera lista, o null si no apareció. */
  ranks: Array<number | null>
}

/**
 * Combina N listas ranked por RRF. Cada lista DEBE venir ordenada de más
 * a menos relevante. Devuelve la lista fusionada, mejor primero.
 *
 * Items con el mismo id en distintas listas se mergean: su score es la
 * suma de pesos por rank.
 */
export function fuseRanked<T>(
  lists: ReadonlyArray<ReadonlyArray<Ranked<T>>>,
  k: number = DEFAULT_K,
): FusionEntry<T>[] {
  const accumulator = new Map<string, FusionEntry<T>>()

  lists.forEach((list, listIdx) => {
    list.forEach((entry, idx) => {
      const rank = idx + 1
      const weight = 1 / (k + rank)
      const existing = accumulator.get(entry.id)
      if (existing) {
        existing.score += weight
        existing.ranks[listIdx] = rank
      } else {
        const ranks: Array<number | null> = new Array(lists.length).fill(null)
        ranks[listIdx] = rank
        accumulator.set(entry.id, {
          id: entry.id,
          item: entry.item,
          score: weight,
          ranks,
        })
      }
    })
  })

  return Array.from(accumulator.values()).sort((a, b) => b.score - a.score)
}
