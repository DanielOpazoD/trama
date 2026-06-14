import type { ObjectKind } from './ast.js'

/**
 * Whitelist de campos consultables por tipo de objeto + metadata de proyección.
 *
 * Es la ÚNICA fuente de nombres de tabla/columna que toca el compilador. Todo
 * lo que no esté acá no se puede consultar. Los valores siempre van como
 * parámetros; de acá sólo salen identificadores SQL de confianza (constantes).
 *
 * Las propiedades de usuario (`prop:<key>`) NO viven acá: son dinámicas
 * (cualquier clave en la columna `properties` JSONB), y el compilador las
 * maneja aparte validando el formato de la clave y parametrizándola.
 *
 * Si un campo no aplica a un kind, el compilador resuelve ese predicado a FALSE
 * para ese kind — así una query cross-tipo con OR sigue siendo intuitiva.
 */

export type FieldType = 'text' | 'number' | 'date' | 'bool'
export type CompareOp =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'between'
  | 'in'
  | 'contains'

export type FieldDef = {
  /** Expresión SQL de confianza (constante, nunca input). */
  sql: string
  type: FieldType
  ops: CompareOp[]
  /** Cast a aplicar al parámetro (p.ej. '::uuid'); para date se usa timestamptz. */
  cast?: string
}

const ALL_COMPARE: CompareOp[] = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'between', 'in']
const TEXT_OPS: CompareOp[] = ['eq', 'neq', 'in', 'contains']

/** Campos presentes en todos los kinds. */
const COMMON: Record<string, FieldDef> = {
  created_at: { sql: 'created_at', type: 'date', ops: ALL_COMPARE },
}

export const FIELDS: Record<ObjectKind, Record<string, FieldDef>> = {
  entity: {
    ...COMMON,
    type: { sql: 'type', type: 'text', ops: TEXT_OPS },
    name: { sql: 'name', type: 'text', ops: TEXT_OPS },
    year: { sql: 'year', type: 'number', ops: ALL_COMPARE },
    origin_kind: { sql: "origin->>'kind'", type: 'text', ops: TEXT_OPS },
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
    origin_kind: { sql: "origin->>'kind'", type: 'text', ops: TEXT_OPS },
  },
  momento: {
    ...COMMON,
    kind: { sql: 'kind', type: 'text', ops: TEXT_OPS },
    captured_at: { sql: 'captured_at', type: 'date', ops: ALL_COMPARE },
    origin_kind: { sql: "origin->>'kind'", type: 'text', ops: TEXT_OPS },
  },
  note: {
    ...COMMON,
    pinned: { sql: 'pinned', type: 'bool', ops: ['eq'] },
  },
}

export type KindMeta = {
  table: string
  title: string
  snippet: string
  occurredAt: string
  /** Expresión SQL que produce text[] de tags. */
  tags: string
  fts: string | null
  ftsFallback: string | null
  /** ¿El kind tiene columna tags consultable? (todos tras la migración Fase 2) */
  hasTags: boolean
  /** Cómo se vincula este kind a una entidad, para el predicado `linked_to`. */
  linkToEntity: 'relationships' | 'entity_id' | 'momento_entities' | null
}

export const KIND_META: Record<ObjectKind, KindMeta> = {
  entity: {
    table: 'entities',
    title: 'name',
    snippet: 'description',
    occurredAt: 'created_at',
    tags: 'tags',
    fts: 'search_vector',
    ftsFallback: null,
    hasTags: true,
    linkToEntity: 'relationships',
  },
  quote: {
    table: 'quotes',
    title: 'left(text, 80)',
    snippet: 'text',
    occurredAt: 'created_at',
    tags: 'tags',
    fts: 'search_vector',
    ftsFallback: null,
    hasTags: true,
    linkToEntity: 'entity_id',
  },
  momento: {
    table: 'momentos',
    title: "coalesce(payload->>'title', payload->>'bodyText', note, kind)",
    snippet: "coalesce(payload->>'bodyText', note, '')",
    occurredAt: 'captured_at',
    tags: 'tags',
    fts: 'search_vector',
    ftsFallback: null,
    hasTags: true,
    linkToEntity: 'momento_entities',
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
    linkToEntity: null,
  },
}
