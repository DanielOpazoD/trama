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
  /** One-liner. Convention: max ~15 words, written as if labeling the entity. */
  description?: string
  /** Long-form personal note about the entity. Markdown allowed. */
  essay?: string
  positionX?: number
  positionY?: number
  origin: Origin
  /** Optional Spotify URL — populated for music entities (banda, musico, cancion, album, disco). */
  spotifyUrl?: string
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
  /** What the user thought when saving the quote. The user's own voice, distinct from the quote text. */
  userReflection?: string
  /** AI-generated interpretation. Stored only after the user explicitly saved it (on-demand, not auto). */
  aiReflection?: string
  aiReflectionProvider?: string
  aiReflectionModel?: string
  aiReflectionAt?: string
  /** Soft references to other quotes (no FK, so a deletion doesn't cascade-cleanse). */
  linkedQuoteIds: string[]
  /** ω-E: timestamp de cuándo fue marcada como favorita. null/undefined = no es favorita. */
  pinnedAt?: string
  origin: Origin
  createdAt: string
  updatedAt: string
}

// ---------- Momentos (ξ — capa temporal de la mente) ----------

export type MomentoKind = 'nota' | 'recorte' | 'foto'

/** Payload variante por kind. Sin discriminated union estricto porque la
 *  validación se hace en el endpoint server-side; el cliente sólo lee. */
export type MomentoPayload = {
  // 'nota'
  bodyText?: string
  // 'recorte'
  url?: string
  title?: string
  source?: string
  author?: string
  screenshotKey?: string
  // 'foto' — single legacy
  storageKey?: string
  width?: number
  height?: number
  caption?: string
  exifDate?: string
  /** υ-multi: array de fotos para un solo momento (un "episodio").
   *  Los nuevos momentos foto SIEMPRE guardan `items` (con 1+ entradas).
   *  Los antiguos siguen funcionando con `storageKey/width/height`
   *  legacy — el render lee `items` si existe; si no, cae al par
   *  single. */
  items?: Array<{
    storageKey: string
    width?: number
    height?: number
  }>
}

export type Momento = {
  id: string
  kind: MomentoKind
  capturedAt: string
  payload: MomentoPayload
  note?: string
  origin: Origin
  /** Entidades vinculadas (extraídas por AI o marcadas manualmente). */
  entityIds: string[]
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
  spotifyUrl?: string
}

export type ProposedRelationship = {
  fromName: string
  toName: string
  type: RelationshipType
  notes?: string
  /** Optional second-model review attached when cross-verification ran. */
  verification?: { agreed: boolean; note?: string; verifier: string }
}

export type ProposedQuote = {
  entityName: string
  text: string
  source?: string
  context?: string
}

/**
 * Edits proposed by the AI to existing rows. The id is the existing row's
 * UUID; the patch carries only the fields the AI wants to change. The UI
 * checkbox is opt-in per row.
 */
export type ProposedEntityEdit = {
  kind: 'entity'
  id: string
  /** Name shown to the user as context — not part of the patch. */
  name: string
  patch: {
    name?: string
    type?: string
    year?: number | null
    description?: string | null
    essay?: string | null
    spotifyUrl?: string | null
  }
  reason?: string
}

export type ProposedQuoteEdit = {
  kind: 'quote'
  id: string
  /** Truncated text + entity name shown for context. */
  preview: string
  entityName?: string
  patch: {
    text?: string
    source?: string | null
    context?: string | null
    entityId?: string
    userReflection?: string | null
  }
  reason?: string
}

export type ProposedRelationshipEdit = {
  kind: 'relationship'
  id: string
  /** "X → asociado_con → Y" shown for context. */
  preview: string
  patch: {
    type?: string
    notes?: string | null
  }
  reason?: string
}

export type ProposedEdit =
  | ProposedEntityEdit
  | ProposedQuoteEdit
  | ProposedRelationshipEdit

/**
 * Deletes proposed by the AI. The UI ALWAYS shows these unchecked by default
 * — the user has to opt in explicitly because the operation is destructive.
 */
export type ProposedDelete = {
  kind: 'entity' | 'quote' | 'relationship'
  id: string
  /** Label or "X → type → Y" for context. */
  preview: string
  reason?: string
}

export type ExtractionProposal = {
  entities: ProposedEntity[]
  relationships: ProposedRelationship[]
  quotes: ProposedQuote[]
  /** Edits to existing rows — only present when the AI proposes them. */
  edits?: ProposedEdit[]
  /** Soft-deletes proposed by the AI. Opt-in only. */
  deletes?: ProposedDelete[]
  /** Which model produced this proposal — surfaced as a chip in the UI. */
  provider?: string
  model?: string
}

// ---------- Export/import payload ----------

export type ExportPayload = {
  version: 1
  exportedAt: string
  entities: Entity[]
  relationships: Relationship[]
  quotes: Quote[]
}

/**
 * Resultado de POST /api/import. Antes era `{ imported: number }`; ahora el
 * endpoint reporta también filas saltadas (validación o duplicados) y filas
 * que reventaron al hacer INSERT. Permite a la UI distinguir "se importaron
 * 140 de 150" entre "10 inválidos" vs "10 reventados".
 */
export type ImportFailedItem = {
  kind: 'entity' | 'relationship' | 'quote'
  id: string | null
  reason: string
}

export type ImportResult = {
  imported: number
  skipped?: number
  failed?: ImportFailedItem[]
}
