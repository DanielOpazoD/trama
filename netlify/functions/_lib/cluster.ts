/**
 * Bloque #5: k-means determinista para el Atlas temático.
 *
 * Agrupa vectores (embeddings de entidades) en `k` clusters por cercanía.
 * Los embeddings se normalizan a norma 1 antes de clusterizar, así la
 * distancia euclídea al cuadrado equivale a la similitud coseno
 * (‖a−b‖² = 2 − 2·cos(a,b) cuando ‖a‖=‖b‖=1).
 *
 * Determinismo: la inicialización es *farthest-first* (sin PRNG) —
 * arranca del punto 0 y elige sucesivamente el más lejano a los
 * centroides ya elegidos. Dado un orden de entrada estable (el endpoint
 * ordena por id), el resultado es reproducible. Eso importa porque el
 * atlas es un artefacto cacheado: regenerar con los mismos datos debe
 * dar el mismo mapa.
 *
 * Módulo puro y sin dependencias — fácil de testear en aislamiento.
 */

export type Vec = number[]

/** Normaliza a norma euclídea 1. Vector cero se devuelve tal cual. */
export function normalize(v: Vec): Vec {
  let norm = 0
  for (const x of v) norm += x * x
  norm = Math.sqrt(norm)
  if (norm === 0) return v.slice()
  return v.map((x) => x / norm)
}

/** Distancia euclídea al cuadrado (evitamos sqrt — solo comparamos). */
function dist2(a: Vec, b: Vec): number {
  let s = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!
    s += d * d
  }
  return s
}

/**
 * Heurística para elegir el número de constelaciones según cuántas
 * entidades hay. ~√(n/2), acotado a [2, 10]. Para una trama chica da
 * pocas constelaciones legibles; crece despacio para no fragmentar de
 * más una trama grande (el atlas es una superficie de lectura, no un
 * dendrograma).
 */
export function chooseK(n: number): number {
  if (n < 2) return 1
  const k = Math.round(Math.sqrt(n / 2))
  return Math.max(2, Math.min(k, 10, n))
}

/**
 * Inicialización farthest-first: centroide 0 = punto 0; cada siguiente
 * centroide es el punto con mayor distancia mínima a los ya elegidos.
 * Determinista y da buena dispersión inicial.
 */
function initCentroids(points: Vec[], k: number): Vec[] {
  const centroids: Vec[] = [points[0]!.slice()]
  const minDist = points.map((p) => dist2(p, centroids[0]!))
  while (centroids.length < k) {
    let best = -1
    let bestD = -1
    for (let i = 0; i < points.length; i++) {
      if (minDist[i]! > bestD) {
        bestD = minDist[i]!
        best = i
      }
    }
    if (best < 0) break
    const next = points[best]!.slice()
    centroids.push(next)
    for (let i = 0; i < points.length; i++) {
      const d = dist2(points[i]!, next)
      if (d < minDist[i]!) minDist[i] = d
    }
  }
  return centroids
}

/**
 * k-means (Lloyd's). Devuelve un array de asignaciones: `assign[i]` es el
 * índice de cluster (0..k−1) del punto i. Itera hasta convergencia o
 * `maxIter`. Clusters que quedan vacíos conservan su centroide previo
 * (no se re-siembran — el resultado sigue siendo determinista).
 */
export function kmeans(points: Vec[], k: number, maxIter = 50): number[] {
  if (points.length === 0) return []
  const realK = Math.max(1, Math.min(k, points.length))
  const centroids = initCentroids(points, realK)
  const dims = points[0]!.length
  const assign = new Array<number>(points.length).fill(0)

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false
    for (let i = 0; i < points.length; i++) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < centroids.length; c++) {
        const d = dist2(points[i]!, centroids[c]!)
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      if (assign[i] !== best) {
        assign[i] = best
        changed = true
      }
    }

    const sums = centroids.map(() => new Array<number>(dims).fill(0))
    const counts = new Array<number>(centroids.length).fill(0)
    for (let i = 0; i < points.length; i++) {
      const c = assign[i]!
      counts[c]!++
      const p = points[i]!
      const s = sums[c]!
      for (let d = 0; d < dims; d++) s[d]! += p[d]!
    }
    for (let c = 0; c < centroids.length; c++) {
      const n = counts[c]!
      if (n > 0) centroids[c] = sums[c]!.map((x) => x / n)
    }

    if (!changed && iter > 0) break
  }

  return assign
}
