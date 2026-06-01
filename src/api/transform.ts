/**
 * Transforms snake_case (SQL) ↔ camelCase (TS) para los rows que vienen del
 * backend. Toda la responsabilidad de cruzar la frontera "datos del servidor"
 * → "datos en memoria de React" vive acá.
 *
 * Cada módulo de dominio importa los Row types y las funciones from-row
 * desde acá; nadie debería duplicar estos transforms.
 */

import type {
  Entity,
  EntityType,
  Momento,
  MomentoKind,
  MomentoPayload,
  Origin,
  Quote,
  Relationship,
  RelationshipType,
} from '../types'

// ---------- Row types ----------

export type EntityRow = {
  id: string
  type: string
  name: string
  year: number | null
  description: string | null
  essay: string | null
  position_x: number | null
  position_y: number | null
  origin: Origin | string
  spotify_url: string | null
  wikipedia_url: string | null
  grokipedia_url: string | null
  created_at: string
  updated_at: string
}

export type RelationshipRow = {
  id: string
  from_id: string
  from_name?: string | null
  to_id: string
  to_name?: string | null
  type: string
  notes: string | null
  origin: Origin | string
  created_at: string
  updated_at: string
}

export type QuoteRow = {
  id: string
  entity_id: string
  text: string
  source: string | null
  user_reflection?: string | null
  ai_reflection?: string | null
  ai_reflection_provider?: string | null
  ai_reflection_model?: string | null
  ai_reflection_at?: string | null
  linked_quote_ids?: string[] | null
  /** ω-E: pinned (favorita) — timestamp ISO o null. */
  pinned_at?: string | null
  /** U-1: resonancia 1-5 o null. */
  resonance?: number | null
  context: string | null
  /** ρ-citas: hipervínculo opcional a la fuente. */
  link?: string | null
  origin: Origin | string
  created_at: string
  updated_at: string
}

export type MomentoRow = {
  id: string
  kind: string
  captured_at: string
  payload: Record<string, unknown> | null
  note: string | null
  origin: unknown
  entity_ids?: string[]
  created_at: string
  updated_at: string
}

// ---------- Transforms ----------

export function asOrigin(value: Origin | string | null | undefined): Origin {
  if (value && typeof value === 'object' && 'kind' in value) return value
  if (typeof value === 'string') return { kind: value === 'ai' ? 'ai' : 'manual' }
  return { kind: 'manual' }
}

export function entityFromRow(row: EntityRow): Entity {
  return {
    id: row.id,
    type: row.type as EntityType,
    name: row.name,
    year: row.year ?? undefined,
    description: row.description ?? undefined,
    essay: row.essay ?? undefined,
    positionX: row.position_x ?? undefined,
    positionY: row.position_y ?? undefined,
    origin: asOrigin(row.origin),
    spotifyUrl: row.spotify_url ?? undefined,
    wikipediaUrl: row.wikipedia_url ?? undefined,
    grokipediaUrl: row.grokipedia_url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function relationshipFromRow(row: RelationshipRow): Relationship {
  return {
    id: row.id,
    fromId: row.from_id,
    fromName: row.from_name ?? undefined,
    toId: row.to_id,
    toName: row.to_name ?? undefined,
    type: row.type as RelationshipType,
    notes: row.notes ?? undefined,
    origin: asOrigin(row.origin),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function quoteFromRow(row: QuoteRow): Quote {
  return {
    id: row.id,
    entityId: row.entity_id,
    text: row.text,
    source: row.source ?? undefined,
    context: row.context ?? undefined,
    userReflection: row.user_reflection ?? undefined,
    aiReflection: row.ai_reflection ?? undefined,
    aiReflectionProvider: row.ai_reflection_provider ?? undefined,
    aiReflectionModel: row.ai_reflection_model ?? undefined,
    aiReflectionAt: row.ai_reflection_at ?? undefined,
    linkedQuoteIds: Array.isArray(row.linked_quote_ids) ? row.linked_quote_ids : [],
    pinnedAt: row.pinned_at ?? undefined,
    resonance: row.resonance ?? undefined,
    link: row.link ?? undefined,
    origin: asOrigin(row.origin),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function momentoFromRow(row: MomentoRow): Momento {
  const kind: MomentoKind =
    row.kind === 'recorte' || row.kind === 'foto' ? row.kind : 'nota'
  return {
    id: row.id,
    kind,
    capturedAt: row.captured_at,
    payload: (row.payload ?? {}) as MomentoPayload,
    note: row.note ?? undefined,
    origin: (row.origin && typeof row.origin === 'object'
      ? row.origin
      : { kind: 'manual' }) as Origin,
    entityIds: row.entity_ids ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
