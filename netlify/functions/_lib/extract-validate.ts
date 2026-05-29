/**
 * Pure validation of an LLM extraction response.
 *
 * Takes whatever the LLM returned and produces a clean, type-safe proposal
 * with malformed/invalid items filtered out, and entity references resolved
 * against the existing graph.
 *
 * No I/O, no globals — easy to test.
 */

import { z } from 'zod'

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

export type CleanedEdit = CleanedEntityEdit | CleanedQuoteEdit | CleanedRelationshipEdit

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

// ---------- Zod schemas for raw LLM output ----------

// Outer proposal: each array field defaults to [] when absent or invalid.
// The outer .catch handles non-object inputs (null, strings, arrays).
const RawProposalSchema = z
  .object({
    entities: z.array(z.unknown()).default([]).catch([]),
    relationships: z.array(z.unknown()).default([]).catch([]),
    quotes: z.array(z.unknown()).default([]).catch([]),
    edits: z.array(z.unknown()).default([]).catch([]),
    deletes: z.array(z.unknown()).default([]).catch([]),
  })
  .catch({ entities: [], relationships: [], quotes: [], edits: [], deletes: [] })

// Required string fields strict; optional extras typed as unknown so a bad
// year (e.g. year:"1919") doesn't drop an otherwise valid entity.
const RawEntityItemSchema = z.object({
  name: z.string(),
  type: z.string(),
  year: z.unknown().optional(),
  description: z.unknown().optional(),
  spotifyUrl: z.unknown().optional(),
})

const RawRelationshipItemSchema = z.object({
  fromName: z.string(),
  toName: z.string(),
  type: z.string(),
  notes: z.unknown().optional(),
})

const RawQuoteItemSchema = z.object({
  entityName: z.string(),
  text: z.string(),
  source: z.unknown().optional(),
  context: z.unknown().optional(),
})

const RawEditItemSchema = z.object({
  kind: z.string(),
  id: z.string(),
  patch: z.record(z.string(), z.unknown()),
  reason: z.unknown().optional(),
})

const RawDeleteItemSchema = z.object({
  kind: z.string(),
  id: z.string(),
  reason: z.unknown().optional(),
})

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
  const proposal = RawProposalSchema.parse(raw ?? {})

  const existingByName = new Map<string, { id: string; type: string }>()
  for (const e of existing) {
    existingByName.set(normalizeName(e.name), { id: e.id, type: e.type })
  }

  const entities = proposal.entities
    .flatMap((e) => {
      const r = RawEntityItemSchema.safeParse(e)
      return r.success && validEntityTypes.has(r.data.type) ? [r.data] : []
    })
    .map((e) => {
      const name = e.name.trim()
      const match = existingByName.get(normalizeName(name))
      return {
        matchedId: match?.id,
        type: e.type,
        name,
        year: typeof e.year === 'number' ? e.year : undefined,
        description: stringOrUndef(e.description),
        spotifyUrl: stringOrUndef(e.spotifyUrl),
      }
    })

  const relationships = proposal.relationships
    .flatMap((r) => {
      const parsed = RawRelationshipItemSchema.safeParse(r)
      if (!parsed.success) return []
      const d = parsed.data
      if (!validRelationshipTypes.has(d.type)) return []
      if (normalizeName(d.fromName) === normalizeName(d.toName)) return []
      return [d]
    })
    .map((r) => ({
      fromName: r.fromName.trim(),
      toName: r.toName.trim(),
      type: r.type,
      notes: stringOrUndef(r.notes),
    }))

  const quotes = proposal.quotes
    .flatMap((q) => {
      const r = RawQuoteItemSchema.safeParse(q)
      if (!r.success) return []
      if (r.data.text.trim().length === 0) return []
      return [r.data]
    })
    .map((q) => ({
      entityName: q.entityName.trim(),
      text: q.text.trim(),
      source: stringOrUndef(q.source),
      context: stringOrUndef(q.context),
    }))

  // ---------- edits & deletes (opt-in via existingIds) ----------

  const edits: CleanedEdit[] = []
  const deletes: CleanedDelete[] = []

  if (existingIds) {
    for (const raw of proposal.edits) {
      const r = RawEditItemSchema.safeParse(raw)
      if (!r.success) continue
      const { kind, id, patch, reason: rawReason } = r.data
      const reason = stringOrUndef(rawReason)

      if (kind === 'entity') {
        const ref = existingIds.entities.get(id)
        if (!ref) continue
        const cleanPatch: CleanedEntityEdit['patch'] = {}
        const newName = stringOrUndef(patch.name)
        if (newName !== undefined) cleanPatch.name = newName
        const newType = stringOrUndef(patch.type)
        if (newType !== undefined && validEntityTypes.has(newType))
          cleanPatch.type = newType
        if (typeof patch.year === 'number') cleanPatch.year = patch.year
        else if (patch.year === null) cleanPatch.year = null
        const desc = nullableString(patch.description)
        if (desc !== undefined) cleanPatch.description = desc
        const essay = nullableString(patch.essay)
        if (essay !== undefined) cleanPatch.essay = essay
        const url = nullableString(patch.spotifyUrl)
        if (url !== undefined) cleanPatch.spotifyUrl = url
        // Drop the edit if patch ends up empty.
        if (Object.keys(cleanPatch).length === 0) continue
        edits.push({ kind: 'entity', id, name: ref.name, patch: cleanPatch, reason })
        continue
      }

      if (kind === 'quote') {
        const ref = existingIds.quotes.get(id)
        if (!ref) continue
        const cleanPatch: CleanedQuoteEdit['patch'] = {}
        const text = stringOrUndef(patch.text)
        if (text !== undefined) cleanPatch.text = text
        const src = nullableString(patch.source)
        if (src !== undefined) cleanPatch.source = src
        const ctx = nullableString(patch.context)
        if (ctx !== undefined) cleanPatch.context = ctx
        const eid = stringOrUndef(patch.entityId)
        if (eid !== undefined && existingIds.entities.has(eid)) cleanPatch.entityId = eid
        const refl = nullableString(patch.userReflection)
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
        const cleanPatch: CleanedRelationshipEdit['patch'] = {}
        const t = stringOrUndef(patch.type)
        if (t !== undefined && validRelationshipTypes.has(t)) cleanPatch.type = t
        const notes = nullableString(patch.notes)
        if (notes !== undefined) cleanPatch.notes = notes
        if (Object.keys(cleanPatch).length === 0) continue
        edits.push({
          kind: 'relationship',
          id,
          preview: ref.preview,
          patch: cleanPatch,
          reason,
        })
      }
    }
  }

  if (existingIds) {
    for (const raw of proposal.deletes) {
      const r = RawDeleteItemSchema.safeParse(raw)
      if (!r.success) continue
      const { kind, id, reason: rawReason } = r.data
      const reason = stringOrUndef(rawReason)
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
