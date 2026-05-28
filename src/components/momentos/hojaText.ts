/**
 * V-4 Hojas sueltas — helpers puros del editor.
 *
 * Una "hoja" es una superficie de escritura que enlaza el archivo con la
 * prosa: `@Nombre` enlaza una entidad, `>` busca una cita y la inserta con
 * atribución. La detección del trigger activo bajo el cursor es la parte
 * delicada — vive acá, sin DOM, para poder testearla aislada.
 *
 * Reglas de detección (mutuamente excluyentes, gana la más cercana al cursor):
 *   - entidad: un `@` precedido por espacio/inicio-de-línea seguido de un
 *     único token SIN espacios hasta el cursor. Token con espacio = mención
 *     terminada (no hay trigger).
 *   - cita: un `>` que es el primer carácter no-blanco de la línea actual.
 *     La query es el resto de la línea hasta el cursor (admite espacios),
 *     al estilo blockquote de markdown — así el usuario escribe una búsqueda
 *     multi-palabra sin que el dropdown se cierre.
 */

export type HojaTrigger =
  | { kind: 'entity'; query: string; start: number; end: number }
  | { kind: 'quote'; query: string; start: number; end: number }

/** Devuelve el trigger activo bajo el cursor, o null si no hay ninguno. */
export function detectTrigger(text: string, caret: number): HojaTrigger | null {
  if (caret < 0 || caret > text.length) return null

  const lineStart = text.lastIndexOf('\n', caret - 1) + 1

  // --- entidad: @token sin espacios, lo más cerca posible del cursor ---
  // Caminamos hacia atrás mientras haya caracteres "de palabra" (no blancos
  // y no triggers). Si frenamos sobre un `@` en frontera, es una mención.
  let i = caret - 1
  while (i >= lineStart && !isSpace(text[i]!) && text[i] !== '@' && text[i] !== '>') {
    i--
  }
  if (i >= lineStart && text[i] === '@') {
    const before = i > 0 ? text[i - 1]! : '\n'
    if (i === 0 || isSpace(before)) {
      return { kind: 'entity', query: text.slice(i + 1, caret), start: i, end: caret }
    }
  }

  // --- cita: `>` como primer carácter no-blanco de la línea ---
  let j = lineStart
  while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++
  if (text[j] === '>' && caret > j) {
    let query = text.slice(j + 1, caret)
    if (query.startsWith(' ')) query = query.slice(1)
    return { kind: 'quote', query, start: j, end: caret }
  }

  return null
}

/**
 * Reemplaza [start, end) por `insert`. Devuelve el texto nuevo y la posición
 * del cursor tras el texto insertado.
 */
export function replaceRange(
  text: string,
  start: number,
  end: number,
  insert: string,
): { text: string; caret: number } {
  const next = text.slice(0, start) + insert + text.slice(end)
  return { text: next, caret: start + insert.length }
}

/**
 * Formatea una cita para insertarla en la prosa: «texto» — atribución.
 * Las comillas latinas marcan la cita como ajena sin depender de tipografía
 * (el bodyText es texto plano). La atribución es opcional.
 */
export function formatQuote(text: string, attribution: string | null): string {
  const body = `«${text.trim()}»`
  const attr = attribution?.trim()
  return attr ? `${body} — ${attr}` : body
}

function isSpace(ch: string): boolean {
  return /\s/.test(ch)
}
