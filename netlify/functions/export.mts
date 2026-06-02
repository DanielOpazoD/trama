import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { STRUCTURED_CORE_EXPORT_SCOPE } from './_lib/export-scope.js'
import { runWithUserRls } from './_lib/user-rls.js'

type JsonRecord = Record<string, unknown>

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined
}

function collectBlobReferences(payload: unknown): string[] {
  const refs = new Set<string>()
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim().length > 0) refs.add(value)
  }
  const itemStorageKeys = (items: unknown) => {
    if (!Array.isArray(items)) return
    for (const item of items) {
      if (item && typeof item === 'object') {
        add((item as JsonRecord).storageKey)
      }
    }
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const p = payload as JsonRecord
    add(p.storageKey)
    add(p.screenshotKey)
    add(p.primaryStorageKey)
    add(p.audioKey)
    itemStorageKeys(p.items)
    itemStorageKeys(p.photos)
  }
  return [...refs].sort()
}

export default withObservability('export', async (req: Request, _ctx, { requestId }) => {
  if (req.method !== 'GET') {
    return ApiErrors.methodNotAllowed(requestId)
  }
  const { id: userId } = await getAuthedUser(req)
  const sql = getSql()

  type EntityRow = {
    id: string
    type: string
    name: string
    year: number | null
    description: string | null
    essay: string | null
    position_x: number | null
    position_y: number | null
    spotify_url: string | null
    wikipedia_url: string | null
    grokipedia_url: string | null
    origin: unknown
    created_at: string
    updated_at: string
  }
  type RelationshipRow = {
    id: string
    from_id: string
    to_id: string
    type: string
    notes: string | null
    origin: unknown
    created_at: string
    updated_at: string
  }
  type QuoteRow = {
    id: string
    entity_id: string
    text: string
    source: string | null
    context: string | null
    user_reflection: string | null
    ai_reflection: string | null
    ai_reflection_provider: string | null
    ai_reflection_model: string | null
    ai_reflection_at: string | null
    linked_quote_ids: string[] | null
    pinned_at: string | null
    resonance: number | null
    link: string | null
    origin: unknown
    created_at: string
    updated_at: string
  }
  type MomentoRow = {
    id: string
    kind: string
    captured_at: string
    payload: unknown
    note: string | null
    origin: unknown
    created_at: string
    updated_at: string
  }
  type MomentoEntityRow = {
    momento_id: string
    entity_id: string
  }
  type NoteRow = {
    id: string
    content: string
    tags: string[] | null
    pinned: boolean
    promoted_momento_id: string | null
    origin: unknown
    created_at: string
    updated_at: string
  }
  type TaskRow = {
    id: string
    title: string
    detail: string | null
    done: boolean
    due_date: string | null
    completed_at: string | null
    tags: string[] | null
    origin: unknown
    created_at: string
    updated_at: string
  }
  type PromptRow = {
    id: string
    title: string
    content: string
    collection: string | null
    tags: string[] | null
    variables: string[] | null
    favorite: boolean
    use_count: number
    last_used_at: string | null
    origin: unknown
    created_at: string
    updated_at: string
  }
  type SecretRow = {
    id: string
    label: string
    secret_value: string
    kind: string
    service: string | null
    username: string | null
    notes: string | null
    favorite: boolean
    critical: boolean
    expires_at: string | null
    last_rotated_at: string | null
    copied_at: string | null
    origin: unknown
    created_at: string
    updated_at: string
  }
  type AttachmentRow = {
    id: string
    owner_type: 'note' | 'prompt'
    owner_id: string
    file_name: string
    mime_type: string
    byte_size: number
    storage_key: string
    origin: unknown
    created_at: string
    updated_at: string
  }

  const [
    entities,
    relationships,
    quotes,
    momentos,
    momentoEntities,
    notes,
    tasks,
    prompts,
    secrets,
    attachments,
  ] =
    (await runWithUserRls(sql, userId, (scoped) => [
      scoped`SELECT id, type, name, year, description, essay, position_x, position_y, origin, spotify_url, wikipedia_url, grokipedia_url, created_at, updated_at
        FROM entities WHERE deleted_at IS NULL AND user_id = ${userId} ORDER BY created_at`,
      scoped`SELECT id, from_id, to_id, type, notes, origin, created_at, updated_at
        FROM relationships WHERE deleted_at IS NULL AND user_id = ${userId} ORDER BY created_at`,
      scoped`SELECT id, entity_id, text, source, context, user_reflection, ai_reflection, ai_reflection_provider, ai_reflection_model, ai_reflection_at, linked_quote_ids, pinned_at, resonance, link, origin, created_at, updated_at
        FROM quotes WHERE deleted_at IS NULL AND user_id = ${userId} ORDER BY created_at`,
      scoped`SELECT id, kind, captured_at, payload, note, origin, created_at, updated_at
        FROM momentos WHERE deleted_at IS NULL AND user_id = ${userId} ORDER BY captured_at, created_at`,
      scoped`SELECT momento_id, entity_id
        FROM momento_entities WHERE deleted_at IS NULL AND user_id = ${userId} ORDER BY momento_id, entity_id`,
      scoped`SELECT id, content, tags, pinned, promoted_momento_id, origin, created_at, updated_at
        FROM notes WHERE deleted_at IS NULL AND user_id = ${userId} ORDER BY created_at`,
      scoped`SELECT id, title, detail, done, due_date, completed_at, tags, origin, created_at, updated_at
        FROM tasks WHERE deleted_at IS NULL AND user_id = ${userId} ORDER BY created_at`,
      scoped`SELECT id, title, content, collection, tags, variables, favorite, use_count, last_used_at, origin, created_at, updated_at
        FROM prompts WHERE deleted_at IS NULL AND user_id = ${userId} ORDER BY created_at`,
      scoped`SELECT id, label, secret_value, kind, service, username, notes, favorite, critical,
              to_char(expires_at, 'YYYY-MM-DD') AS expires_at,
              to_char(last_rotated_at, 'YYYY-MM-DD') AS last_rotated_at,
              copied_at, origin, created_at, updated_at
        FROM secrets WHERE deleted_at IS NULL AND user_id = ${userId} ORDER BY created_at`,
      scoped`SELECT id, owner_type, owner_id, file_name, mime_type, byte_size, storage_key, origin, created_at, updated_at
        FROM notas_attachments WHERE deleted_at IS NULL AND user_id = ${userId} ORDER BY created_at`,
    ])) as [
      EntityRow[],
      RelationshipRow[],
      QuoteRow[],
      MomentoRow[],
      MomentoEntityRow[],
      NoteRow[],
      TaskRow[],
      PromptRow[],
      SecretRow[],
      AttachmentRow[],
    ]
  const entityIdsByMomento = new Map<string, string[]>()
  for (const link of momentoEntities) {
    const list = entityIdsByMomento.get(link.momento_id) ?? []
    list.push(link.entity_id)
    entityIdsByMomento.set(link.momento_id, list)
  }
  const blobReferences = new Set<string>()
  for (const momento of momentos) {
    for (const ref of collectBlobReferences(momento.payload)) blobReferences.add(ref)
  }
  for (const attachment of attachments) blobReferences.add(attachment.storage_key)

  const payload = {
    version: 2 as const,
    scope: {
      label: 'Backup estructurado core',
      ...STRUCTURED_CORE_EXPORT_SCOPE,
    },
    exportedAt: new Date().toISOString(),
    entities: entities.map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      year: optional(row.year),
      description: optional(row.description),
      essay: optional(row.essay),
      positionX: optional(row.position_x),
      positionY: optional(row.position_y),
      spotifyUrl: optional(row.spotify_url),
      wikipediaUrl: optional(row.wikipedia_url),
      grokipediaUrl: optional(row.grokipedia_url),
      origin: row.origin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    relationships: relationships.map((row) => ({
      id: row.id,
      fromId: row.from_id,
      toId: row.to_id,
      type: row.type,
      notes: row.notes ?? undefined,
      origin: row.origin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    quotes: quotes.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      text: row.text,
      source: optional(row.source),
      context: optional(row.context),
      userReflection: optional(row.user_reflection),
      aiReflection: optional(row.ai_reflection),
      aiReflectionProvider: optional(row.ai_reflection_provider),
      aiReflectionModel: optional(row.ai_reflection_model),
      aiReflectionAt: optional(row.ai_reflection_at),
      linkedQuoteIds: row.linked_quote_ids ?? [],
      pinnedAt: optional(row.pinned_at),
      resonance: optional(row.resonance),
      link: optional(row.link),
      origin: row.origin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    momentos: momentos.map((row) => ({
      id: row.id,
      kind: row.kind,
      capturedAt: row.captured_at,
      payload: row.payload,
      note: optional(row.note),
      origin: row.origin,
      entityIds: entityIdsByMomento.get(row.id) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    notes: notes.map((row) => ({
      id: row.id,
      content: row.content,
      tags: row.tags ?? [],
      pinned: row.pinned,
      promotedMomentoId: optional(row.promoted_momento_id),
      origin: row.origin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    tasks: tasks.map((row) => ({
      id: row.id,
      title: row.title,
      detail: optional(row.detail),
      done: row.done,
      dueDate: optional(row.due_date),
      completedAt: optional(row.completed_at),
      tags: row.tags ?? [],
      origin: row.origin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    prompts: prompts.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      collection: optional(row.collection),
      tags: row.tags ?? [],
      variables: row.variables ?? [],
      favorite: row.favorite,
      useCount: row.use_count,
      lastUsedAt: optional(row.last_used_at),
      origin: row.origin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    secrets: secrets.map((row) => ({
      id: row.id,
      label: row.label,
      encryptedSecret: row.secret_value,
      kind: row.kind,
      encryptedService: optional(row.service),
      encryptedUsername: optional(row.username),
      encryptedNotes: optional(row.notes),
      favorite: row.favorite,
      critical: row.critical,
      expiresAt: optional(row.expires_at),
      lastRotatedAt: optional(row.last_rotated_at),
      copiedAt: optional(row.copied_at),
      origin: row.origin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    attachments: attachments.map((row) => ({
      id: row.id,
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      storageKey: row.storage_key,
      origin: row.origin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    blobReferences: [...blobReferences].sort(),
  }

  return Response.json(payload, {
    headers: {
      'Content-Disposition': `attachment; filename="trama-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
})

export const config: Config = {
  path: '/api/export',
}
