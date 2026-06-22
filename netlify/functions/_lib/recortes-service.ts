import { z } from 'zod'
import type { RecorteCreateBody, RecortePatchBody } from './recorte-schemas.js'
import type { EntityLite } from './recorte-suggest-prompt.js'

type RecorteCreateInput = z.infer<typeof RecorteCreateBody>
type RecortePatchInput = z.infer<typeof RecortePatchBody>

export type RecorteSuggestion = {
  relatedEntityIds: string[]
  [key: string]: unknown
}

/**
 * E6 — schema Zod fiel a la proyección canónica de 16 columnas que devuelven
 * los SELECT/RETURNING críticos de recortes (promote, unpromote, el read
 * idempotente de la promoción foto). Se usa con `parseRows(...)` para validar
 * el shape en runtime: si en el futuro alguien edita uno de esos SELECT y
 * omite una columna o cambia su tipo, el parse falla en runtime con el context
 * de la query en vez de devolver datos truncados en silencio.
 *
 * Mapeo columna→tipo verificado contra la migración 20260612000000_recortes
 * (+ capture_mode/image_key de 20260612140000): los TIMESTAMPTZ llegan como
 * string ISO por el driver HTTP de Neon; los CHECK enums se modelan con
 * z.enum; NOT NULL vs nullable replica el esquema. NO incluye `source` ni
 * `images`: esas columnas solo aparecen en `listRecortes`, no en esta
 * proyección.
 */
export const RecorteRowSchema = z.object({
  id: z.string(),
  text: z.string(),
  source_url: z.string().nullable(),
  source_title: z.string().nullable(),
  source_author: z.string().nullable(),
  note: z.string().nullable(),
  image_url: z.string().nullable(),
  image_key: z.string().nullable(),
  capture_mode: z.enum(['citation', 'article', 'html', 'region', 'image']).nullable(),
  status: z.enum(['pending', 'promoted', 'archived']),
  promoted_target: z.enum(['quote', 'entity', 'momento']).nullable(),
  promoted_id: z.string().nullable(),
  captured_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type RecorteRow = z.infer<typeof RecorteRowSchema> & {
  source?: string | null
  images?: Array<{ storage_key: string }> | null
}

function nullishToNull<T>(value: T | null | undefined): T | null {
  return value ?? null
}

export function buildRecorteCreateDraft(body: RecorteCreateInput): {
  text: string
  sourceUrl: string | null
  sourceTitle: string | null
  sourceAuthor: string | null
  note: string | null
  imageUrl: string | null
  imageKey: string | null
  captureMode: string | null
  capturedAt: string | null
} {
  return {
    text: body.text,
    sourceUrl: nullishToNull(body.sourceUrl),
    sourceTitle: nullishToNull(body.sourceTitle),
    sourceAuthor: nullishToNull(body.sourceAuthor),
    note: nullishToNull(body.note),
    imageUrl: nullishToNull(body.imageUrl),
    imageKey: nullishToNull(body.imageKey),
    captureMode: nullishToNull(body.captureMode),
    capturedAt: nullishToNull(body.capturedAt),
  }
}

export function buildRecortePatchDraft(body: RecortePatchInput): {
  text: string | null
  sourceTitle: string | null
  sourceAuthor: string | null
  imageUrl: string | null
  note: string | null
  noteProvided: boolean
  status: 'pending' | 'archived' | null
} {
  return {
    text: body.text ?? null,
    sourceTitle: body.sourceTitle ?? null,
    sourceAuthor: body.sourceAuthor ?? null,
    imageUrl: body.imageUrl ?? null,
    note: body.note ?? null,
    noteProvided: body.note !== undefined,
    status: body.status ?? null,
  }
}

export function recorteImageSourceKeys(recorte: {
  imageKey: string | null
  images?: Array<{ storage_key: string }> | null
}): string[] {
  const eventKeys = (recorte.images ?? [])
    .map((image) => image.storage_key)
    .filter((key) => key.length > 0)
  return eventKeys.length > 0 ? eventKeys : recorte.imageKey ? [recorte.imageKey] : []
}

export function buildRecorteSuggestionResponse<T extends RecorteSuggestion>(
  suggestion: T,
  entityRows: EntityLite[],
): T & { relatedEntities: EntityLite[] } {
  return {
    ...suggestion,
    relatedEntities: entityRows.filter((entity) =>
      suggestion.relatedEntityIds.includes(entity.id),
    ),
  }
}
