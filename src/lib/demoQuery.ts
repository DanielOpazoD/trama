import type { NlQueryResult, QueryHit, QueryInput, QueryResult } from '../api/queryTypes'

type Row = Record<string, unknown>

export type DemoQueryTables = {
  entities: Row[]
  quotes: Row[]
  momentos: Row[]
  notes: Row[]
}

const DEFAULT_LIMIT = 25
const KINDS: QueryHit['kind'][] = ['entity', 'quote', 'momento', 'note']

/**
 * El motor de consultas en la demo, sin Postgres ni IA. Es un espejo modesto
 * de producción con la IA apagada: `/api/query/nl` cae al fallback de texto
 * libre (`matches` sobre los cuatro tipos), y `/api/query` solo honra
 * `matches`, que es lo único que la demo puede producir; sin él devuelve lo
 * más reciente de los tipos pedidos. Orden y límite como `compile.ts`: lo más
 * nuevo primero, 25 por página, sin cursor.
 */
export function demoQueryResponse(
  tables: DemoQueryTables,
  nl: boolean,
  body: Record<string, unknown>,
): QueryResult | NlQueryResult {
  if (!nl) return runDemoQuery(tables, body as unknown as QueryInput)
  const q = typeof body.q === 'string' ? body.q.slice(0, 200) : ''
  const query: QueryInput = { from: [...KINDS], where: { op: 'matches', value: q } }
  return { query, ...runDemoQuery(tables, query), source: 'fallback' }
}

export function runDemoQuery(tables: DemoQueryTables, input: QueryInput): QueryResult {
  const value = findMatches(input.where)
  const kinds = Array.isArray(input.from) ? input.from : []
  const hits = kinds
    .flatMap((kind) =>
      rowsOf(tables, kind)
        .filter((row) => !row.deleted_at)
        .map((row) => toHit(kind, row)),
    )
    .filter(
      (hit) =>
        value === null || containsAll(`${hit.title ?? ''}\n${hit.snippet ?? ''}`, value),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { items: hits.slice(0, input.limit ?? DEFAULT_LIMIT), nextCursor: null }
}

function findMatches(where: QueryInput['where']): string | null {
  if (!where) return null
  if ('op' in where) return where.op === 'matches' ? where.value : null
  if ('and' in where) {
    for (const condition of where.and) {
      const value = findMatches(condition)
      if (value !== null) return value
    }
  }
  return null
}

function rowsOf(tables: DemoQueryTables, kind: QueryHit['kind']): Row[] {
  if (kind === 'entity') return tables.entities
  if (kind === 'quote') return tables.quotes
  if (kind === 'momento') return tables.momentos
  return tables.notes
}

/** Todos los términos, en cualquier orden y sin tildes: websearch_to_tsquery, en chico. */
function containsAll(text: string, value: string): boolean {
  const haystack = fold(text)
  return fold(value)
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term))
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function toHit(kind: QueryHit['kind'], row: Row): QueryHit {
  const base = {
    id: String(row.id),
    createdAt: text(row.created_at) ?? '',
    tags: Array.isArray(row.tags)
      ? row.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
  }
  if (kind === 'entity') {
    return { ...base, kind, title: text(row.name), snippet: text(row.description) }
  }
  if (kind === 'quote')
    return { ...base, kind, title: text(row.text), snippet: text(row.source) }
  if (kind === 'momento') {
    const payload = (row.payload ?? {}) as Row
    const title = text(payload.title) ?? text(payload.caption) ?? text(payload.bodyText)
    return { ...base, kind, title, snippet: text(row.note) }
  }
  const content = text(row.content)
  const title = text(row.title) ?? content?.split('\n')[0]?.slice(0, 80) ?? null
  return { ...base, kind, title, snippet: content }
}
