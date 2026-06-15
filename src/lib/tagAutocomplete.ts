/**
 * Lógica pura (sin React) del autocompletado de etiquetas `#` del composer de
 * Notas. Separada para testearse aislada: detecta el token `#…` que el caret
 * está escribiendo, filtra el universo de etiquetas existentes y compone el
 * texto resultante al elegir una.
 *
 * El popover de la UI (`TagAutocomplete`) solo orquesta teclado + render; toda
 * la decisión de "qué etiqueta activa hay bajo el caret" y "qué texto queda al
 * completar" vive acá.
 */

/** Una etiqueta del universo con su frecuencia (para ordenar sugerencias). */
export type TagEntry = { tag: string; count: number }

/**
 * Token `#…` activo bajo el caret. `query` es lo escrito tras el `#` (sin el
 * numeral), `start`/`end` delimitan el rango del token completo (incluido el
 * `#`) dentro del texto — se usa para reemplazarlo al completar.
 */
export type ActiveTagToken = { query: string; start: number; end: number }

/**
 * Caracteres válidos en el cuerpo de una etiqueta. Coherente con `#etiqueta`:
 * letras (incluye acentos y ñ), dígitos, guion y guion bajo. Un espacio, salto
 * de línea o puntuación cierra el token.
 */
const TAG_BODY = /[\p{L}\p{N}_-]/u

/**
 * Detecta el token `#…` que el caret (`caret`) está escribiendo. Devuelve null
 * si el caret no está dentro de un token de etiqueta válido:
 *   - el `#` debe estar al inicio del texto o precedido de un separador (no
 *     pegado a una palabra, así `foo#bar` no dispara — eso no es una etiqueta);
 *   - entre el `#` y el caret solo puede haber caracteres de cuerpo de tag.
 *
 * Mira solo hacia atrás desde el caret: lo de adelante (si seguís escribiendo
 * la etiqueta) no afecta qué se está tipeando ahora.
 */
export function findActiveTagToken(text: string, caret: number): ActiveTagToken | null {
  // Recorre hacia atrás desde el caret buscando el `#` que abre el token.
  let i = caret - 1
  while (i >= 0) {
    const ch = text[i]!
    if (ch === '#') {
      // El `#` debe abrir token: inicio del texto o tras un separador.
      const before = i > 0 ? text[i - 1]! : ''
      if (before !== '' && TAG_BODY.test(before)) return null
      const query = text.slice(i + 1, caret)
      return { query, start: i, end: caret }
    }
    if (!TAG_BODY.test(ch)) return null
    i--
  }
  return null
}

/**
 * Normaliza para comparar sin acentos ni mayúsculas (matching tolerante: buscar
 * "memo" encuentra "memória"). NFD + quita diacríticos.
 */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Filtra y ordena las etiquetas que matchean la query del token activo.
 *   - Query vacía → todas (ordenadas por frecuencia desc, luego alfabético).
 *   - Con query → las que empiezan con la query primero, luego las que la
 *     contienen; dentro de cada grupo, por frecuencia y luego alfabético.
 *   - Excluye un match exacto (ya está escrita; no tiene sentido sugerirla).
 * `limit` capea la lista para que el popover no crezca sin fin.
 */
export function matchTags(universe: TagEntry[], query: string, limit = 6): TagEntry[] {
  const q = fold(query.trim())
  const scored: Array<{ entry: TagEntry; rank: number }> = []
  for (const entry of universe) {
    const folded = fold(entry.tag)
    if (q && folded === q) continue // match exacto: ya está escrita
    let rank: number
    if (!q) rank = 2
    else if (folded.startsWith(q)) rank = 0
    else if (folded.includes(q)) rank = 1
    else continue
    scored.push({ entry, rank })
  }
  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    if (a.entry.count !== b.entry.count) return b.entry.count - a.entry.count
    return a.entry.tag.localeCompare(b.entry.tag)
  })
  return scored.slice(0, limit).map((s) => s.entry)
}

/**
 * Compone el texto resultante de completar el token activo con `tag`. Reemplaza
 * el rango `[token.start, token.end)` por `#tag ` (con espacio final, para
 * seguir escribiendo) y devuelve el texto nuevo + la posición del caret.
 */
export function completeTag(
  text: string,
  token: ActiveTagToken,
  tag: string,
): { value: string; caret: number } {
  const insert = `#${tag} `
  const value = text.slice(0, token.start) + insert + text.slice(token.end)
  return { value, caret: token.start + insert.length }
}
