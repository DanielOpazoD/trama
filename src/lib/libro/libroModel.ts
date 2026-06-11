import type { Entity, Quote } from '../../types'

/**
 * Libro — modelo puro del florilegio como edición. Acá vive todo lo que
 * se puede decidir sin tocar pdf-lib: qué capítulos hay, en qué orden,
 * qué citas lleva cada uno, el texto del colofón y el partido de líneas.
 * `buildLibro.ts` solo tipografía esto sobre el PDF.
 *
 * Decisiones editoriales:
 *  - Un capítulo por entidad, ordenados por cuántas citas aportan (la
 *    voz más presente abre el libro). Dentro del capítulo, cronológico:
 *    el orden en que esas citas entraron a tu vida.
 *  - El colofón dice la verdad del objeto: cuántas citas, entre qué años
 *    se reunieron. Como la página legal de una edición real.
 */

export type LibroQuote = {
  text: string
  source: string | null
  /** Tu reflexión — sale en Caveat como marginalia, si se pidió. */
  marginalia: string | null
}

export type LibroChapter = {
  title: string
  /** «escritor · 1899» — tipo y año de la entidad, si los hay. */
  subtitle: string | null
  quotes: LibroQuote[]
}

export type LibroOptions = {
  title: string
  author: string | null
  includeMarginalia: boolean
}

export function buildChapters(
  entities: Entity[],
  quotes: Quote[],
  includeMarginalia: boolean,
): LibroChapter[] {
  const byEntity = new Map<string, Quote[]>()
  for (const q of quotes) {
    const list = byEntity.get(q.entityId) ?? []
    list.push(q)
    byEntity.set(q.entityId, list)
  }
  const chapters: LibroChapter[] = []
  for (const e of entities) {
    const list = byEntity.get(e.id)
    if (!list || list.length === 0) continue
    chapters.push({
      title: e.name,
      subtitle:
        [e.type, e.year ? String(e.year) : null].filter(Boolean).join(' · ') || null,
      quotes: [...list]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((q) => ({
          text: q.text,
          source: q.source ?? null,
          marginalia: includeMarginalia ? (q.userReflection ?? null) : null,
        })),
    })
  }
  // La voz más presente abre el libro; a igual peso, alfabético.
  return chapters.sort(
    (a, b) => b.quotes.length - a.quotes.length || a.title.localeCompare(b.title),
  )
}

/** Texto del colofón — la página legal de la edición. */
export function colophonLines(quotes: Quote[], now: Date = new Date()): string[] {
  const years = quotes
    .map((q) => new Date(q.createdAt).getFullYear())
    .filter((y) => !Number.isNaN(y))
  const first = years.length ? Math.min(...years) : null
  const last = years.length ? Math.max(...years) : null
  const n = quotes.length
  const span =
    first === null
      ? ''
      : first === last
        ? ` durante ${first}`
        : ` entre ${first} y ${last}`
  return [
    `Esta edición se compuso con las ${n} citas`,
    `reunidas${span}.`,
    '',
    `Trama · ${now.getFullYear()}`,
  ]
}

/**
 * Parte `text` en líneas que entren en `maxWidth`, midiendo con la
 * función provista (en el PDF real: widthOfTextAtSize de la fuente).
 * Respeta saltos de línea explícitos.
 */
export function wrapLines(
  measure: (s: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split(/\n+/)
  const lines: string[] = []
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (measure(candidate) > maxWidth && current) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) lines.push(current)
  }
  return lines
}
