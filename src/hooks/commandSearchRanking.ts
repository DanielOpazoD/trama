/**
 * Ranking local del buscador (⌘K): cómo se puntúa un texto contra lo escrito.
 * Deliberadamente simple (ver docs/conventions/search-command-palette.md):
 * coincidencia exacta, prefijo, prefijo de palabra y subcadena, sin tildes.
 */

type Ranked<T> = {
  item: T
  score: number
  index: number
}

export function rankMatches<T, R>(
  records: T[],
  q: string,
  fields: (record: T) => Array<{ text: string; weight: number }>,
  map: (record: T) => R,
): R[] {
  if (!q) return records.map(map)

  return records
    .map<Ranked<T>>((record, index) => ({
      item: record,
      index,
      score: Math.max(
        ...fields(record).map((field) => scoreField(q, field.text, field.weight)),
      ),
    }))
    .filter((ranked) => ranked.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((ranked) => map(ranked.item))
}

function scoreField(q: string, text: string, weight: number): number {
  const normalizedText = normalizeQuery(text)
  if (!normalizedText) return -1

  const cleanQ = q.startsWith('#') ? q.slice(1) : q
  const cleanText = normalizedText.startsWith('#')
    ? normalizedText.slice(1)
    : normalizedText
  if (normalizedText === q || cleanText === cleanQ) return weight + 100
  if (normalizedText.startsWith(q) || cleanText.startsWith(cleanQ)) return weight + 75
  if (hasWordPrefix(normalizedText, q) || hasWordPrefix(cleanText, cleanQ)) {
    return weight + 60
  }
  if (normalizedText.includes(q) || cleanText.includes(cleanQ)) return weight + 35
  return -1
}

function hasWordPrefix(text: string, q: string): boolean {
  if (!q) return false
  return text.split(/\s+/).some((word) => word.startsWith(q))
}

export function normalizeQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
