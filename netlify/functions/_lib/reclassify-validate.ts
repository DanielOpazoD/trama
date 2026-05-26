/**
 * Validate an LLM reclassification proposal against the actual entity list
 * and the catalog of available types. Returns a clean list, dropping anything
 * that doesn't reference a real entity, an unknown type, or proposes the same
 * type the entity already has (no-op).
 */

import { z } from 'zod'

export type ReclassifyProposal = Array<{
  id: string
  oldType: string
  newType: string
  reason?: string
  name: string
}>

export type EntityLookup = { id: string; name: string; type: string }

const RawReclassifyItemSchema = z.object({
  id:      z.string(),
  newType: z.string(),
  reason:  z.unknown().optional(),
})

const RawReclassifyProposalSchema = z.object({
  reclassifications: z.array(z.unknown()).optional(),
})

export function validateReclassify(
  raw: unknown,
  existingEntities: EntityLookup[],
  validTypes: ReadonlySet<string>,
): ReclassifyProposal {
  const proposalResult = RawReclassifyProposalSchema.safeParse(raw ?? {})
  if (!proposalResult.success) return []
  if (!Array.isArray(proposalResult.data.reclassifications)) return []

  const byId = new Map(existingEntities.map((e) => [e.id, e]))

  const out: ReclassifyProposal = []
  for (const item of proposalResult.data.reclassifications) {
    const parsed = RawReclassifyItemSchema.safeParse(item)
    if (!parsed.success) continue
    const { id, newType, reason: rawReason } = parsed.data

    const entity = byId.get(id)
    if (!entity) continue
    if (!validTypes.has(newType)) continue
    if (entity.type === newType) continue

    const reason =
      typeof rawReason === 'string' && rawReason.trim()
        ? rawReason.trim()
        : undefined

    out.push({
      id,
      oldType: entity.type,
      newType,
      reason,
      name: entity.name,
    })
  }

  return out
}
