/**
 * Forma del motor de queries: el AST que viaja a `POST /api/query` y los hits
 * que vuelven. El AST se mantiene como estructura serializable: el bloque de
 * query embebible y el traductor lenguaje-natural→AST producen este mismo
 * shape.
 *
 * Vive aparte del cliente para que la demo lo use sin importar `request.ts`,
 * que a su vez carga la demo: juntos formaban un ciclo.
 */

type ObjectKind = 'entity' | 'quote' | 'momento' | 'note'

type Predicate =
  | {
      // campos del registry o `prop:<key>` (propiedad de usuario)
      field: string
      op: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains'
      value: string | number | boolean
    }
  | { field: string; op: 'between'; value: [string | number, string | number] }
  | { field: string; op: 'in'; value: Array<string | number | boolean> }
  | { field: 'tags'; op: 'has_any' | 'has_all'; value: string[] }
  | { op: 'matches'; value: string }
  | { field: string; op: 'exists' }
  | { op: 'linked_to'; id: string }

type Condition =
  { and: Condition[] } | { or: Condition[] } | { not: Condition } | Predicate

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

/** Respuesta de NL→query: incluye el AST interpretado (para mostrar/editar). */
export type NlQueryResult = QueryResult & {
  query: QueryInput
  /** 'llm' si el modelo tradujo; 'fallback' si cayó a búsqueda de texto libre. */
  source: 'llm' | 'fallback'
}
