import type { ExportPayload } from '../../types'

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
