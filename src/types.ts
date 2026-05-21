// ---------- Entity types ----------
//
// EntityType is intentionally just `string`: the real source of truth lives in
// the `entity_types` table in Postgres, so adding a new type (banda, escritor,
// podcast, etc.) is a SQL insert — no code change required. ENTITY_TYPES below
// is a fallback used by older UI surfaces that haven't migrated to the dynamic
// list yet; keep it in sync with the seed migrations.

export type EntityType = string

export const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'persona', label: 'persona' },
  { value: 'escritor', label: 'escritor' },
  { value: 'filosofo', label: 'filósofo' },
  { value: 'musico', label: 'músico' },
  { value: 'banda', label: 'banda / grupo' },
  { value: 'director', label: 'director' },
  { value: 'artista', label: 'artista' },
  { value: 'cientifico', label: 'científico' },
  { value: 'libro', label: 'libro' },
  { value: 'ensayo', label: 'ensayo' },
  { value: 'poema', label: 'poema' },
  { value: 'articulo', label: 'artículo' },
  { value: 'cancion', label: 'canción' },
  { value: 'podcast', label: 'podcast' },
  { value: 'album', label: 'álbum' },
  { value: 'disco', label: 'disco' },
  { value: 'pelicula', label: 'película' },
  { value: 'serie', label: 'serie' },
  { value: 'documental', label: 'documental' },
  { value: 'obra', label: 'obra' },
  { value: 'concepto', label: 'concepto' },
  { value: 'idea', label: 'idea' },
  { value: 'lugar', label: 'lugar' },
  { value: 'evento', label: 'evento' },
]

// ---------- Relationship types ----------

// Like EntityType: the real source of truth is relationship_types in the DB.
// Keep RELATIONSHIP_TYPES below in sync with the seed for the manual form.
export type RelationshipType = string

export const RELATIONSHIP_TYPES: {
  value: RelationshipType
  label: string
  reverseLabel: string
}[] = [
  { value: 'influye_en', label: 'influye en', reverseLabel: 'influido por' },
  { value: 'cita_a', label: 'cita a', reverseLabel: 'citado por' },
  { value: 'responde_a', label: 'responde a', reverseLabel: 'respondido por' },
  { value: 'me_llego_por', label: 'me llegó por', reverseLabel: 'me llevó a' },
  { value: 'suena_como', label: 'suena como', reverseLabel: 'suena como' },
  { value: 'inspira', label: 'inspira', reverseLabel: 'inspirado por' },
  { value: 'contradice', label: 'contradice', reverseLabel: 'contradicho por' },
  { value: 'asociado_con', label: 'asociado con', reverseLabel: 'asociado con' },
]

// ---------- Origin (provenance) ----------

export type OriginKind = 'manual' | 'ai' | 'imported'

export type Origin = {
  kind: OriginKind
  provider?: string         // e.g. 'deepseek', 'openai'
  model?: string            // e.g. 'deepseek-chat'
  extractionLogId?: string  // ref to extraction_log row
  importedFrom?: string     // e.g. 'json-export', 'obsidian'
}

export const MANUAL_ORIGIN: Origin = { kind: 'manual' }

// ---------- Core entities ----------

export type Entity = {
  id: string
  type: EntityType
  name: string
  year?: number
  description?: string
  positionX?: number
  positionY?: number
  origin: Origin
  createdAt: string
  updatedAt: string
}

export type Relationship = {
  id: string
  fromId: string
  toId: string
  type: RelationshipType
  notes?: string
  origin: Origin
  createdAt: string
  updatedAt: string
}

export type Quote = {
  id: string
  entityId: string
  text: string
  source?: string
  context?: string
  origin: Origin
  createdAt: string
  updatedAt: string
}

// ---------- AI extraction proposal shapes (transient — not persisted until accepted) ----------

export type ProposedEntity = {
  matchedId?: string
  type: EntityType
  name: string
  year?: number
  description?: string
}

export type ProposedRelationship = {
  fromName: string
  toName: string
  type: RelationshipType
  notes?: string
}

export type ProposedQuote = {
  entityName: string
  text: string
  source?: string
  context?: string
}

export type ExtractionProposal = {
  entities: ProposedEntity[]
  relationships: ProposedRelationship[]
  quotes: ProposedQuote[]
}

// ---------- Export/import payload ----------

export type ExportPayload = {
  version: 1
  exportedAt: string
  entities: Entity[]
  relationships: Relationship[]
  quotes: Quote[]
}
