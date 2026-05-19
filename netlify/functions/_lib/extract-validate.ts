/**
 * Pure validation of an LLM extraction response.
 *
 * Takes whatever the LLM returned and produces a clean, type-safe proposal
 * with malformed/invalid items filtered out, and entity references resolved
 * against the existing graph.
 *
 * No I/O, no globals — easy to test.
 */

export type ExistingEntityLite = { id: string; name: string; type: string }

export type CleanedProposal = {
  entities: Array<{
    matchedId?: string
    type: string
    name: string
    year?: number
    description?: string
  }>
  relationships: Array<{
    fromName: string
    toName: string
    type: string
    notes?: string
  }>
  quotes: Array<{
    entityName: string
    text: string
    source?: string
    context?: string
  }>
}

const VALID_ENTITY_TYPES = new Set([
  'persona',
  'libro',
  'cancion',
  'album',
  'pelicula',
  'obra',
  'concepto',
  'idea',
])

const VALID_RELATIONSHIP_TYPES = new Set([
  'influye_en',
  'cita_a',
  'responde_a',
  'me_llego_por',
  'suena_como',
  'inspira',
  'contradice',
  'asociado_con',
])

function normalizeName(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * Validate and clean a raw extraction response.
 *
 * @param raw  Whatever the LLM returned (could be any shape, including garbage).
 * @param existing  Existing entities in the graph, used for dedup by name.
 */
export function validateExtraction(
  raw: unknown,
  existing: ExistingEntityLite[],
): CleanedProposal {
  const proposal = (raw ?? {}) as {
    entities?: unknown
    relationships?: unknown
    quotes?: unknown
  }

  const existingByName = new Map<string, { id: string; type: string }>()
  for (const e of existing) {
    existingByName.set(normalizeName(e.name), { id: e.id, type: e.type })
  }

  const entities = Array.isArray(proposal.entities)
    ? (proposal.entities as Array<Record<string, unknown>>)
        .filter(
          (e): e is Record<string, unknown> =>
            typeof e === 'object' &&
            e !== null &&
            typeof e.name === 'string' &&
            typeof e.type === 'string' &&
            VALID_ENTITY_TYPES.has(e.type),
        )
        .map((e) => {
          const name = (e.name as string).trim()
          const match = existingByName.get(normalizeName(name))
          return {
            matchedId: match?.id,
            type: e.type as string,
            name,
            year: typeof e.year === 'number' ? e.year : undefined,
            description:
              typeof e.description === 'string' && e.description.trim()
                ? (e.description as string).trim()
                : undefined,
          }
        })
    : []

  const relationships = Array.isArray(proposal.relationships)
    ? (proposal.relationships as Array<Record<string, unknown>>)
        .filter(
          (r): r is Record<string, unknown> =>
            typeof r === 'object' &&
            r !== null &&
            typeof r.fromName === 'string' &&
            typeof r.toName === 'string' &&
            typeof r.type === 'string' &&
            VALID_RELATIONSHIP_TYPES.has(r.type) &&
            normalizeName(r.fromName as string) !== normalizeName(r.toName as string),
        )
        .map((r) => ({
          fromName: (r.fromName as string).trim(),
          toName: (r.toName as string).trim(),
          type: r.type as string,
          notes:
            typeof r.notes === 'string' && r.notes.trim()
              ? (r.notes as string).trim()
              : undefined,
        }))
    : []

  const quotes = Array.isArray(proposal.quotes)
    ? (proposal.quotes as Array<Record<string, unknown>>)
        .filter(
          (q): q is Record<string, unknown> =>
            typeof q === 'object' &&
            q !== null &&
            typeof q.entityName === 'string' &&
            typeof q.text === 'string' &&
            (q.text as string).trim().length > 0,
        )
        .map((q) => ({
          entityName: (q.entityName as string).trim(),
          text: (q.text as string).trim(),
          source:
            typeof q.source === 'string' && q.source.trim()
              ? (q.source as string).trim()
              : undefined,
          context:
            typeof q.context === 'string' && q.context.trim()
              ? (q.context as string).trim()
              : undefined,
        }))
    : []

  return { entities, relationships, quotes }
}
