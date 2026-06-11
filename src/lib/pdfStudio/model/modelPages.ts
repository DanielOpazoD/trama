import type { PdfDoc } from './modelTypes'

/** Mueve varias páginas como un bloque al índice destino, preservando su orden. */
export function movePages(doc: PdfDoc, indices: number[], to: number): PdfDoc {
  const n = doc.pages.length
  if (indices.length === 0 || to < 0 || to >= n) return doc
  const selected = Array.from(
    new Set(indices.filter((index) => index >= 0 && index < n)),
  ).sort((a, b) => a - b)
  if (selected.length === 0 || selected.includes(to)) return doc
  const selectedSet = new Set(selected)
  const block = selected.map((index) => doc.pages[index]!)
  const rest = doc.pages.filter((_, index) => !selectedSet.has(index))
  const insertAt = Math.min(Math.max(0, to), rest.length)
  return {
    ...doc,
    pages: [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)],
  }
}
