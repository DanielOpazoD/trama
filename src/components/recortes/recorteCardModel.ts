import type { Recorte, RecorteSuggestion, RecorteTarget } from '../../api'
import { youtubeThumb } from '../../lib/youtubeThumb'
import type { PromoteSeed } from './PromoteModal'

const TARGET_LABEL: Record<RecorteTarget, string> = {
  quote: 'cita',
  entity: 'entidad',
  momento: 'momento',
}

const CAPTURE_MODE_LABEL: Record<NonNullable<Recorte['captureMode']>, string> = {
  citation: 'cita',
  article: 'artículo',
  html: 'página',
  region: 'región',
  image: 'imagen',
  video: 'video',
}

export function formatRecorteStamp(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d
    .toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
    .replace(/\./g, '')
}

export function recorteTargetLabel(target: RecorteTarget): string {
  return TARGET_LABEL[target]
}

export function recorteCaptureModeLabel(
  captureMode: NonNullable<Recorte['captureMode']>,
): string {
  return CAPTURE_MODE_LABEL[captureMode]
}

export function looksLikePlaceholder(text: string, recorte: Recorte): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return true
  if (t === 'imagen guardada' || t === 'recorte visual de la página') return true
  if (recorte.sourceTitle && t === recorte.sourceTitle.trim().toLowerCase()) return true
  return false
}

export function recorteHasMediaPreview(recorte: Recorte): boolean {
  return (
    !!recorte.imageKey ||
    !!recorte.imageUrl ||
    youtubeThumb(recorte.sourceUrl ?? '') !== null
  )
}

export function buildRecorteCardFlags(recorte: Recorte): {
  hasVideo: boolean
  hasImage: boolean
  hasInternalImage: boolean
  hasPreview: boolean
} {
  const hasVideo = recorte.captureMode === 'video' && !!recorte.imageKey
  return {
    hasVideo,
    hasImage: !hasVideo && !!(recorte.imageKey || recorte.imageUrl),
    hasInternalImage: !!(recorte.imageKey || recorte.images.length > 0) && !hasVideo,
    hasPreview: recorteHasMediaPreview(recorte),
  }
}

export function buildPromoteSeedFromSuggestion(
  suggestion: RecorteSuggestion,
): PromoteSeed {
  const seed: PromoteSeed = { title: suggestion.title }
  if (suggestion.target === 'quote' && suggestion.relatedEntities[0]) {
    const entity = suggestion.relatedEntities[0]
    seed.entityId = entity.id
    seed.entityName = entity.name
    seed.entityType = entity.type
  }
  if (suggestion.target === 'entity') {
    seed.entityName = suggestion.suggestedEntityName ?? undefined
    seed.entityType = suggestion.suggestedEntityType ?? undefined
  }
  return seed
}
