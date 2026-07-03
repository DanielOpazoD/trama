import {
  savedTemplateStatus,
  type SavedDoc,
  type SavedTemplateStatus,
} from '../../../../lib/pdfStudio/render/persistence'

export type SavedTemplateStatusFilter = 'all' | SavedTemplateStatus

/** Filtra plantillas por texto (nombre + descripción + tags, todos los tokens
 *  deben calzar) y por estado de biblioteca. */
export function filterSavedTemplates(
  templates: SavedDoc[],
  query: string,
  status: SavedTemplateStatusFilter = 'all',
): SavedDoc[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return templates.filter((saved) => {
    if (status !== 'all' && savedTemplateStatus(saved) !== status) return false
    if (tokens.length === 0) return true
    const haystack = [saved.name, saved.description ?? '', ...(saved.tags ?? [])]
      .join(' ')
      .toLowerCase()
    return tokens.every((token) => haystack.includes(token))
  })
}

export function countSavedTemplatesByStatus(
  templates: SavedDoc[],
): Record<SavedTemplateStatus, number> {
  const counts = { draft: 0, ready: 0 }
  for (const saved of templates) counts[savedTemplateStatus(saved)] += 1
  return counts
}

/** Entrada libre "a, b, c" → tags limpias, sin vacíos ni duplicados. */
export function parseTemplateTags(input: string): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const raw of input.split(',')) {
    const tag = raw.trim().replace(/^#/, '')
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }
  return tags
}
