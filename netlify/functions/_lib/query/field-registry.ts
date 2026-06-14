import type { ObjectKind } from './ast.js'

/**
 * Whitelist de campos consultables por tipo de objeto + metadata de proyección.
 *
 * Es la ÚNICA fuente de nombres de tabla/columna que toca el compilador. Todo
 * lo que no esté acá no se puede consultar. Los valores siempre van como
 * parámetros; de acá sólo salen identificadores SQL de confianza (constantes).
 *
 * Si un campo no aplica a un kind (p.ej. `year` en `note`), el compilador
 * resuelve ese predicado a FALSE para ese kind — así una query cross-tipo con
 * OR sigue siendo intuitiva.
 */

export type FieldType = 'text' | 'number' | 'date' | 'bool'
export type CompareOp = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'between' | 'in'

export type FieldDef = {
  /** Expresión SQL de confianza (constante, nunca input). */
  sql: string
  type: FieldType
  ops: CompareOp[]
  /** Cast a aplicar al parámetro (p.ej. '::uuid'); para date se usa timestamptz. */
  cast?: string
}

const ALL_COMPARE: CompareOp[] = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'between', 'in']
const EQ_IN: CompareOp[] = ['eq', 'neq', 'in']

/** Campos presentes en todos los kinds. */
const COMMON: Record<string, FieldDef> = {
  created_at: { sql: 'created_at', type: 'date', ops: ALL_COMPARE },
}

export const FIELDS: Record<ObjectKind, Record<string, FieldDef>> = {
  entity: {
    ...COMMON,
    type: { sql: 'type', type: 'text', ops: EQ_IN },
    name: { sql: 'name', type: 'text', ops: EQ_IN },
    year: { sql: 'year', type: 'number', ops: ALL_COMPARE },
    origin_kind: { sql: "origin->>'kind'", type: 'text', ops: EQ_IN },
  },
  quote: {
    ...COMMON,
    entity_id: {
      sql: 'entity_id',
      type: 'text',
      ops: ['eq', 'neq', 'in'],
      cast: '::uuid',
    },
    pinned: { sql: 'pinned', type: 'bool', ops: ['eq'] },
    origin_kind: { sql: "origin->>'kind'", type: 'text', ops: EQ_IN },
  },
  momento: {
    ...COMMON,
    kind: { sql: 'kind', type: 'text', ops: EQ_IN },
    captured_at: { sql: 'captured_at', type: 'date', ops: ALL_COMPARE },
    origin_kind: { sql: "origin->>'kind'", type: 'text', ops: EQ_IN },
  },
  note: {
    ...COMMON,
    pinned: { sql: 'pinned', type: 'bool', ops: ['eq'] },
  },
}

export type KindMeta = {
  table: string
  /** Expresión SQL para el título del resultado. */
  title: string
  /** Expresión SQL para el snippet/preview. */
  snippet: string
  /** Columna/expresión de "cuándo ocurrió" (para sort=occurred_at). */
  occurredAt: string
  /** Expresión SQL que produce text[] de tags ('{}'::text[] si no tiene). */
  tags: string
  /** Columna search_vector para FTS, o null si el kind no la tiene. */
  fts: string | null
  /** Columna de texto para ILIKE cuando no hay FTS (p.ej. notes.content). */
  ftsFallback: string | null
  /** ¿El kind tiene columna tags consultable? */
  hasTags: boolean
}

export const KIND_META: Record<ObjectKind, KindMeta> = {
  entity: {
    table: 'entities',
    title: 'name',
    snippet: 'description',
    occurredAt: 'created_at',
    tags: "'{}'::text[]",
    fts: 'search_vector',
    ftsFallback: null,
    hasTags: false,
  },
  quote: {
    table: 'quotes',
    title: 'left(text, 80)',
    snippet: 'text',
    occurredAt: 'created_at',
    tags: "'{}'::text[]",
    fts: 'search_vector',
    ftsFallback: null,
    hasTags: false,
  },
  momento: {
    table: 'momentos',
    title: "coalesce(payload->>'title', payload->>'bodyText', note, kind)",
    snippet: "coalesce(payload->>'bodyText', note, '')",
    occurredAt: 'captured_at',
    tags: "'{}'::text[]",
    fts: 'search_vector',
    ftsFallback: null,
    hasTags: false,
  },
  note: {
    table: 'notes',
    title: 'left(content, 80)',
    snippet: 'content',
    occurredAt: 'created_at',
    tags: 'tags',
    fts: null,
    ftsFallback: 'content',
    hasTags: true,
  },
}
