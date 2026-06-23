import type { MomentoKind } from './momento-embed.js'
import { QueryParam } from './request-contracts.js'
import type { MomentoEntityLinkRow, MomentoListRow } from './backend-row-schemas.js'
import { z } from 'zod'
export type { MomentoEntityLinkRow, MomentoListRow } from './backend-row-schemas.js'

function isValidKind(v: unknown): v is MomentoKind {
  return v === 'nota' || v === 'recorte' || v === 'foto'
}

export const MomentosListQuery = z.object({
  kind: z.preprocess(
    (value) => {
      const kind = typeof value === 'string' ? value.trim() : null
      return isValidKind(kind) ? kind : null
    },
    z.union([z.literal('nota'), z.literal('recorte'), z.literal('foto'), z.null()]),
  ),
  limit: z.preprocess(
    QueryParam.clampedInteger({ defaultValue: 50, min: 1, max: 200 }).normalize,
    z.number().int().min(1).max(200),
  ),
  cursor: z.preprocess(
    QueryParam.trimmedString({ max: 200 }).normalize,
    z.string().max(200),
  ),
})

export type MomentosListQueryT = z.infer<typeof MomentosListQuery>

export function buildMomentosListParams(query: MomentosListQueryT): {
  limit: number
  validKind: MomentoKind | null
  cursorTs: string | null
  cursorId: string | null
} {
  let cursorTs: string | null = null
  let cursorId: string | null = null
  if (query.cursor) {
    const idx = query.cursor.lastIndexOf(':')
    if (idx > 0) {
      cursorTs = query.cursor.slice(0, idx)
      cursorId = query.cursor.slice(idx + 1)
    }
  }

  return {
    limit: query.limit,
    validKind: query.kind,
    cursorTs,
    cursorId,
  }
}

export function parseMomentosListParams(url: URL) {
  const parsed = MomentosListQuery.parse(Object.fromEntries(url.searchParams.entries()))
  return buildMomentosListParams(parsed)
}

export function groupMomentoEntityLinks(
  links: readonly MomentoEntityLinkRow[],
): Map<string, string[]> {
  const linksByMomento = new Map<string, string[]>()
  for (const link of links) {
    const arr = linksByMomento.get(link.momento_id) ?? []
    arr.push(link.entity_id)
    linksByMomento.set(link.momento_id, arr)
  }
  return linksByMomento
}

export function buildMomentosListResponse({
  rows,
  limit,
  linksByMomento,
}: {
  rows: MomentoListRow[]
  limit: number
  linksByMomento: ReadonlyMap<string, string[]>
}): {
  items: Array<MomentoListRow & { entity_ids: string[] }>
  nextCursor: string | null
} {
  const hasNext = rows.length > limit
  const items = hasNext ? rows.slice(0, limit) : rows
  const last = hasNext ? items[items.length - 1] : null
  const nextCursor = last
    ? `${new Date(last.captured_at).toISOString()}:${last.id}`
    : null

  return {
    items: items.map((r) => ({
      ...r,
      entity_ids: linksByMomento.get(r.id) ?? [],
    })),
    nextCursor,
  }
}
