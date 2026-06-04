/**
 * Historial genérico para undo/redo (PR "edición fiel"). Puro e inmutable: un
 * `present` con pilas `past`/`future`. Como el `PdfDoc` es inmutable, cada estado
 * es solo una referencia → los snapshots son baratos. Acotado a `MAX` para no
 * crecer sin límite. Vive aparte del modelo porque es reusable y 100% testeable.
 */
export type History<T> = { past: T[]; present: T; future: T[] }

const MAX = 50

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] }
}

/** Empuja un nuevo estado; descarta el futuro (rama nueva). No-op si no cambió. */
export function pushHistory<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h
  const past = [...h.past, h.present]
  if (past.length > MAX) past.shift()
  return { past, present: next, future: [] }
}

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1]
  if (prev === undefined) return h
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] }
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0]
  if (next === undefined) return h
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) }
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0
