/**
 * Lógica PURA del autocompletar de etiquetas `#` en el composer de Notas.
 *
 * El editor es un `<textarea>` plano (markdown crudo), así que el "estado" del
 * autocompletar se deriva enteramente del texto + posición del caret. Estas
 * funciones no tocan el DOM ni React — son testeable en aislamiento y son la
 * única autoridad sobre "¿estoy escribiendo una etiqueta y cuál?".
 */

/** Una etiqueta `#` en curso, detectada a partir del caret. */
export type ActiveTagToken = {
  /** El texto YA escrito tras el `#` (sin el `#`). Puede ser vacío. */
  query: string
  /** Índice del `#` en el texto (inclusive). */
  start: number
  /** Índice del caret (exclusivo) — fin del token. */
  end: number
}

// Caracteres válidos dentro de una etiqueta. Coherente con cómo el feed parsea
// `#etiqueta` (letras, números, guion bajo y guion). Acentos/ñ incluidos.
const TAG_CHAR = /[\p{L}\p{N}_-]/u

/**
 * Detecta si el caret está dentro de un token de etiqueta `#…` recién iniciado.
 *
 * Reglas:
 *  - Mira hacia atrás desde el caret hasta encontrar el `#`.
 *  - El `#` debe estar al inicio del texto o precedido por un espacio/salto
 *    (no matchea en medio de una palabra, p. ej. una URL con `#fragmento`).
 *  - Entre el `#` y el caret solo puede haber caracteres válidos de etiqueta.
 *
 * Devuelve `null` si el caret no está componiendo una etiqueta.
 */
export function findActiveTag(text: string, caret: number): ActiveTagToken | null {
  if (caret < 0 || caret > text.length) return null
  // Camina hacia atrás desde el caret mientras veamos caracteres de etiqueta.
  let i = caret
  while (i > 0 && TAG_CHAR.test(text[i - 1] ?? '')) i -= 1
  // El carácter inmediatamente anterior al run debe ser el `#`.
  if (i === 0 || text[i - 1] !== '#') return null
  const hashIndex = i - 1
  // El `#` debe estar "suelto": inicio del texto o precedido por whitespace.
  const before = hashIndex > 0 ? (text[hashIndex - 1] ?? '') : ''
  if (before !== '' && !/\s/.test(before)) return null
  return {
    query: text.slice(i, caret),
    start: hashIndex,
    end: caret,
  }
}

/**
 * Filtra el universo de etiquetas existentes contra la query (prefijo,
 * case-insensitive y tolerante a acentos). Excluye un match exacto (no tiene
 * sentido sugerir lo que ya está escrito completo). Orden: las que empiezan con
 * la query primero, luego las que la contienen; alfabético dentro de cada grupo.
 */
export function matchTags(universe: string[], query: string, limit = 6): string[] {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
  const q = norm(query)
  const seen = new Set<string>()
  const prefix: string[] = []
  const contains: string[] = []
  for (const raw of universe) {
    const tag = raw.trim()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    const n = norm(tag)
    if (n === q) continue // ya escrito completo
    if (q === '') {
      prefix.push(tag)
    } else if (n.startsWith(q)) {
      prefix.push(tag)
    } else if (n.includes(q)) {
      contains.push(tag)
    }
  }
  const byName = (a: string, b: string) => a.localeCompare(b)
  prefix.sort(byName)
  contains.sort(byName)
  return [...prefix, ...contains].slice(0, limit)
}

/**
 * Aplica la etiqueta elegida al texto: reemplaza el token activo `#query` por
 * `#tag ` (con espacio final para seguir escribiendo). Devuelve el texto nuevo
 * y la posición del caret resultante.
 */
export function applyTag(
  text: string,
  token: ActiveTagToken,
  tag: string,
): { value: string; caret: number } {
  const insert = `#${tag} `
  const value = text.slice(0, token.start) + insert + text.slice(token.end)
  return { value, caret: token.start + insert.length }
}
