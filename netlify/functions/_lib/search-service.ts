import { fuseRanked, type FusionEntry, type Ranked } from './rrf.js'

export type SearchMode = 'hybrid' | 'lexical' | 'semantic'

export type EntitySearchItem = {
  id: string
  name: string
  type: string
  description: string | null
  year: number | null
}

export type QuoteSearchItem = {
  id: string
  entity_id: string
  entity_name: string
  text: string
  source: string | null
}

export type MomentoSearchItem = {
  id: string
  kind: string
  captured_at: string | Date
  text: string
}

export type CronicaSearchItem = {
  id: string
  year: number
  month: number
  text: string
}

export type ChatSearchItem = {
  id: string
  thread_id: string
  thread_title: string | null
  role: string
  text: string
}

export type SearchFusedEntry<T> = FusionEntry<T>

export function buildEmptySearchPayload() {
  return {
    entities: [],
    quotes: [],
    momentos: [],
    cronicas: [],
    chat: [],
  }
}

export function buildSearchModePlan(
  mode: SearchMode,
  limit: number,
  wantsRerank: boolean,
): {
  wantsLexical: boolean
  wantsSemantic: boolean
  fusedWidth: number
} {
  return {
    wantsLexical: mode !== 'semantic',
    wantsSemantic: mode !== 'lexical',
    fusedWidth: wantsRerank ? Math.min(limit * 2, 30) : limit,
  }
}

export function toRanked<T extends { id: string }>(list: T[]): Ranked<T>[] {
  return list.map((item) => ({ id: item.id, item }))
}

export function fuseSearchBranches<T extends { id: string }>(
  first: T[],
  second: T[],
  limit: number,
): Array<SearchFusedEntry<T>> {
  return fuseRanked([toRanked(first), toRanked(second)]).slice(0, limit)
}

export function fuseSingleSearchBranch<T extends { id: string }>(
  list: T[],
  limit: number,
): Array<SearchFusedEntry<T>> {
  return fuseRanked([toRanked(list)]).slice(0, limit)
}

export function applySearchRerank<T extends { item: { id: string } }>(
  fused: T[],
  reordered: string[] | null,
): T[] {
  if (!reordered) return fused
  const map = new Map(fused.map((entry) => [entry.item.id, entry]))
  const result: T[] = []
  for (const id of reordered) {
    const hit = map.get(id)
    if (hit) result.push(hit)
  }
  return result
}

export function buildSearchResponse(params: {
  mode: SearchMode
  wantsRerank: boolean
  limit: number
  entitiesFused: Array<SearchFusedEntry<EntitySearchItem>>
  quotesFused: Array<SearchFusedEntry<QuoteSearchItem>>
  momentosFused: Array<SearchFusedEntry<MomentoSearchItem>>
  cronicasFused: Array<SearchFusedEntry<CronicaSearchItem>>
  chatFused: Array<SearchFusedEntry<ChatSearchItem>>
  entitiesReorderedIds: string[] | null
  quotesReorderedIds: string[] | null
}) {
  const entitiesFinal = applySearchRerank(
    params.entitiesFused,
    params.entitiesReorderedIds,
  )
    .slice(0, params.limit)
    .map((entry, idx) => ({
      id: entry.item.id,
      name: entry.item.name,
      type: entry.item.type,
      description: entry.item.description,
      year: entry.item.year,
      score: entry.score,
      lexicalRank: entry.ranks[0],
      semanticRank: entry.ranks[1],
      finalRank: idx + 1,
      reranked: !!params.entitiesReorderedIds,
      lexical: 0,
      semantic: 0,
    }))

  const quotesFinal = applySearchRerank(params.quotesFused, params.quotesReorderedIds)
    .slice(0, params.limit)
    .map((entry, idx) => ({
      id: entry.item.id,
      entityId: entry.item.entity_id,
      entityName: entry.item.entity_name,
      text: entry.item.text,
      source: entry.item.source,
      score: entry.score,
      lexicalRank: entry.ranks[0],
      semanticRank: entry.ranks[1],
      finalRank: idx + 1,
      reranked: !!params.quotesReorderedIds,
      lexical: 0,
      semantic: 0,
    }))

  const momentosFinal = params.momentosFused.map((entry) => ({
    id: entry.item.id,
    kind: entry.item.kind,
    text: entry.item.text,
    capturedAt: entry.item.captured_at,
    score: entry.score,
  }))

  const cronicasFinal = params.cronicasFused.map((entry) => ({
    id: entry.item.id,
    year: entry.item.year,
    month: entry.item.month,
    text: entry.item.text,
    score: entry.score,
  }))

  const chatFinal = params.chatFused.map((entry) => ({
    id: entry.item.id,
    threadId: entry.item.thread_id,
    threadTitle: entry.item.thread_title,
    role: entry.item.role,
    text: entry.item.text,
    score: entry.score,
  }))

  return {
    entities: entitiesFinal,
    quotes: quotesFinal,
    momentos: momentosFinal,
    cronicas: cronicasFinal,
    chat: chatFinal,
    mode: params.mode,
    reranked:
      params.wantsRerank &&
      (!!params.entitiesReorderedIds || !!params.quotesReorderedIds),
  }
}
