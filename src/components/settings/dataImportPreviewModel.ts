import type { ExportPayload, ImportResult } from '../../types'

export type BucketCount = { incoming: number; news: number; duplicates: number }

export type ImportPreview = {
  entities: BucketCount
  relationships: BucketCount
  quotes: BucketCount
  momentos: BucketCount
  notes: BucketCount
  tasks: BucketCount
  totalIncoming: number
  totalNew: number
  totalDuplicates: number
}

export type ParsedImportFile = {
  payload: ExportPayload
  fileName: string
}

export type ExistingImportIdSets = {
  entityIds: Set<string>
  relationshipIds: Set<string>
  quoteIds: Set<string>
  momentoIds: Set<string>
  noteIds: Set<string>
  taskIds: Set<string>
}

type ExistingImportSources = {
  entities: Array<{ id: string }>
  relationships: Array<{ id: string }>
  quotes: Array<{ id: string }>
  momentos: Array<{ id: string }>
  notes: Array<{ id: string }>
  tasks: Array<{ id: string }>
}

export function parseImportPayloadText(text: string, fileName: string): ParsedImportFile {
  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('payload inválido')
  }
  const payload = parsed as ExportPayload
  if (payload.version !== 1 && payload.version !== 2) {
    throw new Error(`versión ${payload.version} no soportada`)
  }
  return { payload, fileName }
}

export function formatImportResultMessage(result: ImportResult): string {
  const failedCount = result.failed?.length ?? 0
  if (failedCount === 0) return `Agregadas ${result.imported} entradas a tu trama`

  const firstReason = result.failed?.[0]?.reason ?? 'desconocido'
  return `Agregadas ${result.imported}, ${failedCount} con error (primero: ${firstReason.slice(
    0,
    60,
  )}). Revisa Logs en Settings.`
}

export function buildExistingImportIdSets({
  entities,
  relationships,
  quotes,
  momentos,
  notes,
  tasks,
}: ExistingImportSources): ExistingImportIdSets {
  return {
    entityIds: new Set(entities.map((entity) => entity.id)),
    relationshipIds: new Set(relationships.map((relationship) => relationship.id)),
    quoteIds: new Set(quotes.map((quote) => quote.id)),
    momentoIds: new Set(momentos.map((momento) => momento.id)),
    noteIds: new Set(notes.map((note) => note.id)),
    taskIds: new Set(tasks.map((task) => task.id)),
  }
}

/**
 * Calcula el preview comparando los IDs del archivo contra los existentes.
 * Una fila sin id se considera duplicada porque el import real no puede
 * demostrar que sea nueva.
 */
export function buildPreview(
  payload: ExportPayload,
  existingEntityIds: Set<string>,
  existingRelationshipIds: Set<string>,
  existingQuoteIds: Set<string>,
  existingMomentoIds: Set<string> = new Set(),
  existingNoteIds: Set<string> = new Set(),
  existingTaskIds: Set<string> = new Set(),
): ImportPreview {
  const entities = countBucket(payload.entities ?? [], existingEntityIds)
  const relationships = countBucket(payload.relationships ?? [], existingRelationshipIds)
  const quotes = countBucket(payload.quotes ?? [], existingQuoteIds)
  const momentos = countBucket(payload.momentos ?? [], existingMomentoIds)
  const notes = countBucket(payload.notes ?? [], existingNoteIds)
  const tasks = countBucket(payload.tasks ?? [], existingTaskIds)
  const buckets = [entities, relationships, quotes, momentos, notes, tasks]

  return {
    entities,
    relationships,
    quotes,
    momentos,
    notes,
    tasks,
    totalIncoming: buckets.reduce((sum, bucket) => sum + bucket.incoming, 0),
    totalNew: buckets.reduce((sum, bucket) => sum + bucket.news, 0),
    totalDuplicates: buckets.reduce((sum, bucket) => sum + bucket.duplicates, 0),
  }
}

function countBucket(items: Array<{ id?: string }>, existing: Set<string>): BucketCount {
  const seen = new Set(existing)
  let news = 0
  let duplicates = 0
  for (const item of items) {
    if (item.id && !seen.has(item.id)) {
      news++
      seen.add(item.id)
    } else {
      duplicates++
    }
  }
  return { incoming: items.length, news, duplicates }
}
