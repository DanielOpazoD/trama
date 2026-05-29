/**
 * Extrae las #etiquetas del contenido de una nota.
 *
 * Reglas:
 *   - El '#' debe ir al inicio o tras un espacio (así "a#b" en una URL o
 *     "## título" de markdown NO cuentan como tag).
 *   - El tag son letras/números/guion/guion-bajo, 1–40 chars.
 *   - Se devuelven únicos y en minúsculas, sin el '#'.
 */
export function parseTags(content: string): string[] {
  const out = new Set<string>()
  const re = /(?:^|\s)#([\p{L}\p{N}_-]{1,40})/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    out.add(m[1]!.toLowerCase())
  }
  return [...out]
}
