import { VaultEnvelopeString } from './vault-envelope.js'

export type IncomingEntity = {
  id: string
  type: string
  name: string
  year?: number | null
  description?: string | null
  essay?: string | null
  positionX?: number | null
  positionY?: number | null
  spotifyUrl?: string | null
  wikipediaUrl?: string | null
  grokipediaUrl?: string | null
  origin?: unknown
}

export type IncomingRelationship = {
  id: string
  fromId: string
  toId: string
  type: string
  notes?: string | null
  origin?: unknown
}

export type IncomingQuote = {
  id: string
  entityId: string
  text: string
  source?: string | null
  context?: string | null
  userReflection?: string | null
  aiReflection?: string | null
  aiReflectionProvider?: string | null
  aiReflectionModel?: string | null
  aiReflectionAt?: string | null
  linkedQuoteIds?: string[]
  pinnedAt?: string | null
  resonance?: number | null
  link?: string | null
  origin?: unknown
}

export type IncomingMomento = {
  id: string
  kind: string
  capturedAt?: string | null
  payload: Record<string, unknown>
  note?: string | null
  origin?: unknown
  entityIds: string[]
}

export type IncomingNote = {
  id: string
  content: string
  tags: string[]
  pinned: boolean
  promotedMomentoId?: string | null
  origin?: unknown
}

export type IncomingTask = {
  id: string
  title: string
  detail?: string | null
  done: boolean
  dueDate?: string | null
  priority?: string | null
  weekStart?: string | null
  completedAt?: string | null
  tags: string[]
  origin?: unknown
}

export type IncomingPrompt = {
  id: string
  title: string
  content: string
  collection?: string | null
  tags: string[]
  variables: string[]
  favorite: boolean
  useCount: number
  origin?: unknown
}

export type IncomingSecret = {
  id: string
  label: string
  encryptedSecret: string
  kind: string
  encryptedService?: string | null
  encryptedUsername?: string | null
  encryptedNotes?: string | null
  favorite: boolean
  critical: boolean
  expiresAt?: string | null
  lastRotatedAt?: string | null
  origin?: unknown
}

export type IncomingImportPayload = {
  entities: Array<IncomingEntity | null>
  relationships: Array<IncomingRelationship | null>
  quotes: Array<IncomingQuote | null>
  momentos: Array<IncomingMomento | null>
  notes: Array<IncomingNote | null>
  tasks: Array<IncomingTask | null>
  prompts: Array<IncomingPrompt | null>
  secrets: Array<IncomingSecret | null>
}

type RawImportPayload = Partial<
  Record<keyof IncomingImportPayload, unknown[] | undefined>
>

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function incomingEntity(value: unknown): IncomingEntity | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const type = stringValue(item.type)
  const name = stringValue(item.name)
  if (!id || !type || !name) return null
  return {
    id,
    type,
    name,
    year: nullableNumber(item.year),
    description: nullableString(item.description),
    essay: nullableString(item.essay),
    positionX: nullableNumber(item.positionX),
    positionY: nullableNumber(item.positionY),
    spotifyUrl: nullableString(item.spotifyUrl),
    wikipediaUrl: nullableString(item.wikipediaUrl),
    grokipediaUrl: nullableString(item.grokipediaUrl),
    origin: item.origin,
  }
}

function incomingRelationship(value: unknown): IncomingRelationship | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const fromId = stringValue(item.fromId)
  const toId = stringValue(item.toId)
  const type = stringValue(item.type)
  if (!id || !fromId || !toId || !type) return null
  return {
    id,
    fromId,
    toId,
    type,
    notes: nullableString(item.notes),
    origin: item.origin,
  }
}

function incomingQuote(value: unknown): IncomingQuote | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const entityId = stringValue(item.entityId)
  const text = stringValue(item.text)
  if (!id || !entityId || !text) return null
  return {
    id,
    entityId,
    text,
    source: nullableString(item.source),
    context: nullableString(item.context),
    userReflection: nullableString(item.userReflection),
    aiReflection: nullableString(item.aiReflection),
    aiReflectionProvider: nullableString(item.aiReflectionProvider),
    aiReflectionModel: nullableString(item.aiReflectionModel),
    aiReflectionAt: nullableString(item.aiReflectionAt),
    linkedQuoteIds: stringArray(item.linkedQuoteIds),
    pinnedAt: nullableString(item.pinnedAt),
    resonance: nullableNumber(item.resonance),
    link: nullableString(item.link),
    origin: item.origin,
  }
}

function incomingMomento(value: unknown): IncomingMomento | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const kind = stringValue(item.kind)
  const payload = asRecord(item.payload)
  if (!id || !kind || !payload) return null
  return {
    id,
    kind,
    capturedAt: nullableString(item.capturedAt),
    payload,
    note: nullableString(item.note),
    origin: item.origin,
    entityIds: stringArray(item.entityIds),
  }
}

function incomingNote(value: unknown): IncomingNote | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const content = stringValue(item.content)
  if (!id || !content) return null
  return {
    id,
    content,
    tags: stringArray(item.tags),
    pinned: booleanValue(item.pinned),
    promotedMomentoId: nullableString(item.promotedMomentoId),
    origin: item.origin,
  }
}

function incomingTask(value: unknown): IncomingTask | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const title = stringValue(item.title)
  if (!id || !title) return null
  const rawPriority = stringValue(item.priority)
  return {
    id,
    title,
    detail: nullableString(item.detail),
    done: booleanValue(item.done),
    dueDate: nullableString(item.dueDate),
    priority:
      rawPriority === 'alta' || rawPriority === 'media' || rawPriority === 'baja'
        ? rawPriority
        : null,
    weekStart: nullableString(item.weekStart),
    completedAt: nullableString(item.completedAt),
    tags: stringArray(item.tags),
    origin: item.origin,
  }
}

function incomingPrompt(value: unknown): IncomingPrompt | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const title = stringValue(item.title)
  const content = stringValue(item.content)
  if (!id || !title || !content) return null
  return {
    id,
    title,
    content,
    collection: nullableString(item.collection),
    tags: stringArray(item.tags),
    variables: stringArray(item.variables),
    favorite: booleanValue(item.favorite),
    useCount: nullableNumber(item.useCount) ?? 0,
    origin: item.origin,
  }
}

function incomingSecret(value: unknown): IncomingSecret | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const label = stringValue(item.label)
  const encryptedSecret = stringValue(item.encryptedSecret)
  const kind = stringValue(item.kind)
  if (!id || !label || !encryptedSecret || !kind) return null
  if (!VaultEnvelopeString.safeParse(encryptedSecret).success) return null
  const encryptedService = encryptedField(item.encryptedService ?? item.service)
  const encryptedUsername = encryptedField(item.encryptedUsername ?? item.username)
  const encryptedNotes = encryptedField(item.encryptedNotes ?? item.notes)
  return {
    id,
    label,
    encryptedSecret,
    kind,
    encryptedService,
    encryptedUsername,
    encryptedNotes,
    favorite: booleanValue(item.favorite),
    critical: booleanValue(item.critical),
    expiresAt: nullableString(item.expiresAt),
    lastRotatedAt: nullableString(item.lastRotatedAt),
    origin: item.origin,
  }
}

function encryptedField(value: unknown): string | null {
  const candidate = nullableString(value)
  if (!candidate) return null
  return VaultEnvelopeString.safeParse(candidate).success ? candidate : null
}

export function parseIncomingImportPayload(
  payload: RawImportPayload,
): IncomingImportPayload {
  return {
    entities: (payload.entities ?? []).map(incomingEntity),
    relationships: (payload.relationships ?? []).map(incomingRelationship),
    quotes: (payload.quotes ?? []).map(incomingQuote),
    momentos: (payload.momentos ?? []).map(incomingMomento),
    notes: (payload.notes ?? []).map(incomingNote),
    tasks: (payload.tasks ?? []).map(incomingTask),
    prompts: (payload.prompts ?? []).map(incomingPrompt),
    secrets: (payload.secrets ?? []).map(incomingSecret),
  }
}
