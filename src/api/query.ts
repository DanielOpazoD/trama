/**
 * Motor de queries componibles (Fase 1). Envía un AST a `POST /api/query` y
 * recibe hits cross-tipo (entity/quote/momento/note) con paginación keyset.
 *
 * El AST se mantiene como estructura serializable: el día de mañana, el bloque
 * de query embebible y el traductor lenguaje-natural→AST producen este mismo
 * shape.
 */

import { request } from './request'

export type ObjectKind = 'entity' | 'quote' | 'momento' | 'note'

export type Predicate =
  | {
      field: string
      op: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'
      value: string | number | boolean
    }
  | { field: string; op: 'between'; value: [string | number, string | number] }
  | { field: string; op: 'in'; value: Array<string | number | boolean> }
  | { field: 'tags'; op: 'has_any' | 'has_all'; value: string[] }
  | { op: 'matches'; value: string }

export type Condition =
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition }
  | Predicate

export type QueryInput = {
  from: ObjectKind[]
  where?: Condition
  sort?: { field: 'created_at' | 'occurred_at'; dir: 'asc' | 'desc' }
  limit?: number
  cursor?: string
}

export type QueryHit = {
  kind: ObjectKind
  id: string
  title: string | null
  snippet: string | null
  createdAt: string
  tags: string[]
}

export type QueryResult = { items: QueryHit[]; nextCursor: string | null }

export const queryApi = {
  run(input: QueryInput): Promise<QueryResult> {
    return request<QueryResult>('/api/query', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
}
