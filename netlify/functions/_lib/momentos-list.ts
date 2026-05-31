import type { MomentoKind } from './momento-embed.js'

export type MomentoListRow = {
  id: string
  kind: string
  captured_at: Date | string
  payload: unknown
  note: string | null
  origin: unknown
  created_at: Date | string
  updated_at: Date | string
}

export type MomentoEntityLinkRow = {
  momento_id: string
  entity_id: string
}

function isValidKind(v: unknown): v is MomentoKind {
  return v === 'nota' || v === 'recorte' || v === 'foto'
}

export function parseMomentosListParams(url: URL): {
  limit: number
  validKind: MomentoKind | null
  cursorTs: string | null
  cursorId: string | null
} {
  const kind = url.searchParams.get('kind')
  const limitParam = url.searchParams.get('limit')
  const cursor = url.searchParams.get('cursor')

  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 50
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 200)
    : 50

  let cursorTs: string | null = null
  let cursorId: string | null = null
  if (cursor) {
    const idx = cursor.lastIndexOf(':')
    if (idx > 0) {
      cursorTs = cursor.slice(0, idx)
      cursorId = cursor.slice(idx + 1)
    }
  }

  return {
    limit,
    validKind: isValidKind(kind) ? kind : null,
    cursorTs,
    cursorId,
  }
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
