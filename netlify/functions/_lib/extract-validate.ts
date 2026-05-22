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

export type CleanedEntityEdit = {
  kind: 'entity'
  id: string
  name: string
  patch: {
    name?: string
    type?: string
    year?: number | null
    description?: string | null
    essay?: string | null
    spotifyUrl?: string | null
  }
  reason?: string
}

export type CleanedQuoteEdit = {
  kind: 'quote'
  id: string
  preview: string
  entityName?: string
  patch: {
    text?: string
    source?: string | null
    context?: string | null
    entityId?: string
    userReflection?: string | null
  }
  reason?: string
}

export type CleanedRelationshipEdit = {
  kind: 'relationship'
  id: string
  preview: string
  patch: {
    type?: string
    notes?: string | null
  }
  reason?: string
}

export type CleanedEdit =
  | CleanedEntityEdit
  | CleanedQuoteEdit
  | CleanedRelationshipEdit

export type CleanedDelete = {
  kind: 'entity' | 'quote' | 'relationship'
  id: string
  preview: string
  reason?: string
}

export type CleanedProposal = {
  entities: Array<{
    matchedId?: string
    type: string
    name: string
    year?: number
    description?: string
    spotifyUrl?: string
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
  edits: CleanedEdit[]
  deletes: CleanedDelete[]
}

/**
 * Optional context for validating edits & deletes. Each row maps id →
 * (name/preview, type). When this is not supplied, edits/deletes proposed by
 * the AI are dropped entirely — safety default. The function caller decides
 * when to enable AI editing/deletion by passing this context.
 */
export type ExtractionExistingIds = {
  entities: Map<string, { name: string; type: string }>
  quotes: Map<string, { text: string; entityName: string }>
  relationships: Map<string, { preview: string }>
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase()
}

function stringOrUndef(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const trimmed = v.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function nullableString(v: unknown): string | null | undefined {
  if (v === null) return null
  if (typeof v !== 'string') return undefined
  const trimmed = v.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * @param raw  Whatever the LLM returned.
 * @param existing  Existing entities, for dedup-by-name.
 * @param validEntityTypes  Whitelist of acceptable entity type slugs.
 * @param validRelationshipTypes  Whitelist of acceptable relationship type slugs.
 * @param existingIds  Optional id-keyed maps. When supplied, edits/deletes
 *                     are validated against real ids; otherwise dropped.
 */
export function validateExtraction(
  raw: unknown,
  existing: ExistingEntityLite[],
  validEntityTypes: ReadonlySet<string>,
  validRelationshipTypes: ReadonlySet<string>,
  existingIds?: ExtractionExistingIds,
): CleanedProposal {
  const proposal = (raw ?? {}) as {
    entities?: unknown
    relationships?: unknown
    quotes?: unknown
    edits?: unknown
    deletes?: unknown
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
            validEntityTypes.has(e.type),
        )
        .map((e) => {
          const name = (e.name as string).trim()
          const match = existingByName.get(normalizeName(name))
          return {
            matchedId: match?.id,
            type: e.type as string,
            name,
            year: typeof e.year === 'number' ? e.year : undefined,
            description: stringOrUndef(e.description),
            spotifyUrl: stringOrUndef(e.spotifyUrl),
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
            validRelationshipTypes.has(r.type) &&
            normalizeName(r.fromName as string) !== normalizeName(r.toName as string),
        )
        .map((r) => ({
          fromName: (r.fromName as string).trim(),
          toName: (r.toName as string).trim(),
          type: r.type as string,
          notes: stringOrUndef(r.notes),
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
          source: stringOrUndef(q.source),
          context: stringOrUndef(q.context),
        }))
    : []

  // ---------- edits & deletes (opt-in via existingIds) ----------

  const edits: CleanedEdit[] = []
  const deletes: CleanedDelete[] = []

  if (existingIds && Array.isArray(proposal.edits)) {
    for (const item of proposal.edits as Array<Record<string, unknown>>) {
      if (!item || typeof item !== 'object') continue
      const kind = item.kind
      const id = item.id
      const patch = item.patch
      if (typeof id !== 'string' || typeof patch !== 'object' || patch === null) continue
      const reason = stringOrUndef(item.reason)

      if (kind === 'entity') {
        const ref = existingIds.entities.get(id)
        if (!ref) continue
        const p = patch as Record<string, unknown>
        const cleanPatch: CleanedEntityEdit['patch'] = {}
        const newName = stringOrUndef(p.name)
        if (newName !== undefined) cleanPatch.name = newName
        const newType = stringOrUndef(p.type)
        if (newType !== undefined && validEntityTypes.has(newType)) cleanPatch.type = newType
        if (typeof p.year === 'number') cleanPatch.year = p.year
        else if (p.year === null) cleanPatch.year = null
        const desc = nullableString(p.description)
        if (desc !== undefined) cleanPatch.description = desc
        const essay = nullableString(p.essay)
        if (essay !== undefined) cleanPatch.essay = essay
        const url = nullableString(p.spotifyUrl)
        if (url !== undefined) cleanPatch.spotifyUrl = url
        // Drop the edit if patch ends up empty.
        if (Object.keys(cleanPatch).length === 0) continue
        edits.push({ kind: 'entity', id, name: ref.name, patch: cleanPatch, reason })
        continue
      }

      if (kind === 'quote') {
        const ref = existingIds.quotes.get(id)
        if (!ref) continue
        const p = patch as Record<string, unknown>
        const cleanPatch: CleanedQuoteEdit['patch'] = {}
        const text = stringOrUndef(p.text)
        if (text !== undefined) cleanPatch.text = text
        const src = nullableString(p.source)
        if (src !== undefined) cleanPatch.source = src
        const ctx = nullableString(p.context)
        if (ctx !== undefined) cleanPatch.context = ctx
        const eid = stringOrUndef(p.entityId)
        if (eid !== undefined && existingIds.entities.has(eid)) cleanPatch.entityId = eid
        const refl = nullableString(p.userReflection)
        if (refl !== undefined) cleanPatch.userReflection = refl
        if (Object.keys(cleanPatch).length === 0) continue
        edits.push({
          kind: 'quote',
          id,
          preview: ref.text.slice(0, 80),
          entityName: ref.entityName,
          patch: cleanPatch,
          reason,
        })
        continue
      }

      if (kind === 'relationship') {
        const ref = existingIds.relationships.get(id)
        if (!ref) continue
        const p = patch as Record<string, unknown>
        const cleanPatch: CleanedRelationshipEdit['patch'] = {}
        const t = stringOrUndef(p.type)
        if (t !== undefined && validRelationshipTypes.has(t)) cleanPatch.type = t
        const notes = nullableString(p.notes)
        if (notes !== undefined) cleanPatch.notes = notes
        if (Object.keys(cleanPatch).length === 0) continue
        edits.push({ kind: 'relationship', id, preview: ref.preview, patch: cleanPatch, reason })
      }
    }
  }

  if (existingIds && Array.isArray(proposal.deletes)) {
    for (const item of proposal.deletes as Array<Record<string, unknown>>) {
      if (!item || typeof item !== 'object') continue
      const kind = item.kind
      const id = item.id
      if (typeof id !== 'string') continue
      const reason = stringOrUndef(item.reason)
      if (kind === 'entity') {
        const ref = existingIds.entities.get(id)
        if (!ref) continue
        deletes.push({ kind: 'entity', id, preview: ref.name, reason })
      } else if (kind === 'quote') {
        const ref = existingIds.quotes.get(id)
        if (!ref) continue
        deletes.push({
          kind: 'quote',
          id,
          preview: `«${ref.text.slice(0, 60)}» — ${ref.entityName}`,
          reason,
        })
      } else if (kind === 'relationship') {
        const ref = existingIds.relationships.get(id)
        if (!ref) continue
        deletes.push({ kind: 'relationship', id, preview: ref.preview, reason })
      }
    }
  }

  return { entities, relationships, quotes, edits, deletes }
}
