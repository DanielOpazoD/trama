/**
 * Validate an LLM reclassification proposal against the actual entity list
 * and the catalog of available types. Returns a clean list, dropping anything
 * that doesn't reference a real entity, an unknown type, or proposes the same
 * type the entity already has (no-op).
 */

export type ReclassifyProposal = Array<{
  id: string
  oldType: string
  newType: string
  reason?: string
  name: string
}>

export type EntityLookup = { id: string; name: string; type: string }

export function validateReclassify(
  raw: unknown,
  existingEntities: EntityLookup[],
  validTypes: ReadonlySet<string>,
): ReclassifyProposal {
  const proposal = (raw ?? {}) as { reclassifications?: unknown }
  if (!Array.isArray(proposal.reclassifications)) return []

  const byId = new Map(existingEntities.map((e) => [e.id, e]))

  const out: ReclassifyProposal = []
  for (const item of proposal.reclassifications as Array<Record<string, unknown>>) {
    if (typeof item !== 'object' || item === null) continue
    const id = typeof item.id === 'string' ? item.id : null
    const newType = typeof item.newType === 'string' ? item.newType : null
    if (!id || !newType) continue

    const entity = byId.get(id)
    if (!entity) continue
    if (!validTypes.has(newType)) continue
    if (entity.type === newType) continue

    const reason =
      typeof item.reason === 'string' && item.reason.trim()
        ? (item.reason as string).trim()
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
