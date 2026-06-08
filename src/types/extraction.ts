/**
 * Shapes transientes que NO se persisten hasta que el usuario las acepta.
 * Lo que la IA propone, el usuario revisa, el usuario aplica.
 *
 * Los tipos individuales (`ProposedEntity`, `ProposedQuote`, etc.) viven
 * en `src/schemas/proposal.ts` como schemas Zod + inferred types.
 * Acá vive solo el contenedor `ExtractionProposal` que los agrupa.
 */

import type {
  ProposedDelete,
  ProposedEdit,
  ProposedEntity,
  ProposedQuote,
  ProposedRelationship,
} from '../schemas/proposal'

export type ExtractionProposal = {
  entities: ProposedEntity[]
  relationships: ProposedRelationship[]
  quotes: ProposedQuote[]
  /** Edits a filas existentes — solo presente si la IA los propone. */
  edits?: ProposedEdit[]
  /** Soft-deletes propuestos por la IA. Opt-in only. */
  deletes?: ProposedDelete[]
  /** Qué modelo produjo esta propuesta — chip en la UI. */
  provider?: string
  model?: string
}

// Re-export para que `from './'` siga resolviendo estos nombres
// sin que cada call site tenga que saber que viven en schemas/.
export type {
  ProposedEntity,
  ProposedRelationship,
  ProposedQuote,
  ProposedEntityEdit,
  ProposedQuoteEdit,
  ProposedRelationshipEdit,
  ProposedEdit,
  ProposedDelete,
} from '../schemas/proposal'
