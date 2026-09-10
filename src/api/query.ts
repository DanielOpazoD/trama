/**
 * Motor de queries componibles (Fase 1). Envía un AST a `POST /api/query` y
 * recibe hits cross-tipo (entity/quote/momento/note) con paginación keyset.
 * La forma del AST y de los hits vive en `queryTypes.ts`.
 */

import { request } from './request'
import type { NlQueryResult, QueryInput, QueryResult } from './queryTypes'

export type { NlQueryResult, QueryHit, QueryInput, QueryResult } from './queryTypes'

export const queryApi = {
  run(input: QueryInput): Promise<QueryResult> {
    return request<QueryResult>('/api/query', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  /** "Pregúntale a tu Trama": lenguaje natural → AST → resultados. */
  ask(q: string): Promise<NlQueryResult> {
    return request<NlQueryResult>('/api/query/nl', {
      method: 'POST',
      body: JSON.stringify({ q }),
    })
  },
}
