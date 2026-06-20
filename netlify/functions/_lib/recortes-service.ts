import type { z } from 'zod'
import type { RecorteCreateBody, RecortePatchBody } from './recorte-schemas.js'
import type { EntityLite } from './recorte-suggest-prompt.js'

type RecorteCreateInput = z.infer<typeof RecorteCreateBody>
type RecortePatchInput = z.infer<typeof RecortePatchBody>

export type RecorteSuggestion = {
  relatedEntityIds: string[]
  [key: string]: unknown
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
