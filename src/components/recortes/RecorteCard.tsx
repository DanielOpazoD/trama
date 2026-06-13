import { useState } from 'react'
import { type Recorte, type RecorteSuggestion, type RecorteTarget } from '../../api'
import { recorteImageUrl } from '../../api/recortes'
import { apiFetch } from '../../api/request'
import { useSuggestRecorte, useUpdateRecorte } from '../../state'
import { useToast } from '../../state/toast'
import { SparkleIcon } from '../Icons'
import { useAuthenticatedMediaState } from '../momentos/AuthenticatedMedia'
import type { PromoteSeed } from './PromoteModal'
import { markdownToPreview } from './recorteMarkdownPreview'

function formatStamp(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d
    .toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
    .replace(/\./g, '')
}

function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

const TARGET_LABEL: Record<RecorteTarget, string> = {
  quote: 'cita',
  entity: 'entidad',
  momento: 'momento',
}

/** Etiqueta del modo de captura (chip). 'citation' es la norma -> sin chip. */
const CAPTURE_MODE_LABEL: Record<NonNullable<Recorte['captureMode']>, string> = {
  citation: 'cita',
  article: 'artículo',
  html: 'página',
  region: 'región',
  image: 'imagen',
}

// Pixel transparente mientras el blob authed viaja (evita el icono roto).
const TRANSPARENT_PX =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/**
 * Imagen del recorte. Prefiere `imageKey` (blob interno authed, servido vía
 * AuthenticatedMedia con Bearer) sobre `imageUrl` (URL http externa directa).
 * Sin imagen -> no renderiza nada.
 */
function RecorteImage({ recorte: r }: { recorte: Recorte }) {
  const authedSrc = r.imageKey ? recorteImageUrl(r.imageKey) : null
  const { src, status } = useAuthenticatedMediaState(authedSrc)
  const shown = authedSrc ? src : r.imageUrl
  if (!authedSrc && !r.imageUrl) return null

  const href = r.sourceUrl ?? r.imageUrl ?? undefined
  const inner = (
    <img
      src={shown ?? TRANSPARENT_PX}
      alt=""
      loading="lazy"
      className={`block max-h-56 w-full object-cover ${
        status === 'loading' ? 'animate-pulse-subtle' : ''
      }`.trim()}
      style={shown ? undefined : { backgroundColor: 'rgb(var(--paper-100) / 0.6)' }}
    />
  )
  const frame = 'mt-2 block overflow-hidden rounded-md border border-ink-100'
  // imageKey interno: no es navegable como URL pública -> caja sin enlace.
  return href && !r.imageKey ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={frame}>
      {inner}
    </a>
  ) : (
    <div className={frame}>{inner}</div>
  )
}

/**
 * Baja la imagen del recorte como File para pasarla al OCR. Prefiere el blob
 * interno authed (imageKey, vía apiFetch con Bearer); si no, la URL externa.
 */
async function fetchRecorteImageFile(r: Recorte): Promise<File> {
  if (r.imageKey) {
    const res = await apiFetch(recorteImageUrl(r.imageKey))
    if (!res.ok) throw new Error('No se pudo leer la imagen del recorte')
    const blob = await res.blob()
    return new File([blob], 'recorte', { type: blob.type || 'image/webp' })
  }
  if (r.imageUrl) {
    const res = await fetch(r.imageUrl)
    if (!res.ok) throw new Error('No se pudo leer la imagen externa')
    const blob = await res.blob()
    return new File([blob], 'recorte', { type: blob.type || 'image/jpeg' })
  }
  throw new Error('El recorte no tiene imagen')
}

/**
 * ¿El texto es solo un pie de foto autogenerado (título/"Imagen guardada")?
 * Si lo es, el OCR lo reemplaza; si no, se anexa para no perder lo escrito.
 */
function looksLikePlaceholder(text: string, r: Recorte): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return true
  if (t === 'imagen guardada' || t === 'recorte visual de la página') return true
  if (r.sourceTitle && t === r.sourceTitle.trim().toLowerCase()) return true
  return false
}

/**
 * Banner de la sugerencia de la IA: destino propuesto, por qué, título y
 * entidades conectadas, con un clic para promover ya pre-llenado.
 */
function SuggestionBanner({
  suggestion,
  onUse,
}: {
  suggestion: RecorteSuggestion
  onUse: () => void
}) {
  return (
    <div className="mt-2.5 rounded-md border border-[color:var(--accent-gold-soft)] bg-[color:var(--accent-gold-soft)] px-3 py-2">
      <div className="flex items-center gap-1.5 text-micro uppercase tracking-eyebrow text-[color:var(--accent-gold)]">
        <SparkleIcon size={11} />
        la IA sugiere
      </div>
      <p className="mt-1 font-serif text-sm text-ink-700">
        → {TARGET_LABEL[suggestion.target]}
        {suggestion.title && (
          <span className="text-ink-500"> · «{suggestion.title}»</span>
        )}
      </p>
      {suggestion.rationale && (
        <p className="mt-0.5 text-caption text-ink-500">{suggestion.rationale}</p>
      )}
      {suggestion.relatedEntities.length > 0 && (
        <p className="mt-1 text-micro text-ink-400">
          conecta con {suggestion.relatedEntities.map((e) => e.name).join(', ')}
        </p>
      )}
      <button
        onClick={onUse}
        className="mt-2 text-micro uppercase tracking-eyebrow text-ink-600 hover:text-ink-900 transition-colors"
      >
        usar sugerencia →
      </button>
    </div>
  )
}

export function RecorteCard({
  recorte: r,
  onPromote,
  onArchive,
  onRestore,
  onDelete,
}: {
  recorte: Recorte
  onPromote: (recorte: Recorte, target: RecorteTarget, seed?: PromoteSeed) => void
  onArchive: () => void
  onRestore: () => void
  onDelete: () => void
}) {
  const host = hostOf(r.sourceUrl)
  const suggest = useSuggestRecorte()
  const update = useUpdateRecorte()
  const toast = useToast()
  const [suggestion, setSuggestion] = useState<RecorteSuggestion | null>(null)
  const [ocrBusy, setOcrBusy] = useState(false)
  const hasImage = !!(r.imageKey || r.imageUrl)

  async function handleSuggest() {
    try {
      setSuggestion(await suggest.mutateAsync(r.id))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'La IA no está disponible'
      toast.show({ message: msg, tone: 'error' })
    }
  }

  async function handleOcr() {
    if (ocrBusy) return
    setOcrBusy(true)
    try {
      const file = await fetchRecorteImageFile(r)
      const [{ renderOcrInputPages }, { recognizeOcrPages }] = await Promise.all([
        import('../../lib/pdfStudio/ocr/pdfOcrInput'),
        import('../../lib/pdfStudio/ocr/pdfOcrRecognition'),
      ])
      const rendered = await renderOcrInputPages(file, { language: 'spa+eng' })
      const pages = await recognizeOcrPages(rendered, { language: 'spa+eng' })
      const ocrText = pages
        .map((p) => p.text)
        .join('\n\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      if (!ocrText) {
        toast.show({ message: 'No se reconoció texto en la imagen', tone: 'error' })
        return
      }
      const base = r.text.trim()
      const merged = looksLikePlaceholder(base, r) ? ocrText : `${base}\n\n${ocrText}`
      await update.mutateAsync({ id: r.id, patch: { text: merged.slice(0, 20000) } })
      toast.show({ message: 'Texto extraído de la imagen', tone: 'success' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo extraer el texto'
      toast.show({ message: msg, tone: 'error' })
    } finally {
      setOcrBusy(false)
    }
  }

  function useSuggestion() {
    if (!suggestion) return
    const seed: PromoteSeed = { title: suggestion.title }
    if (suggestion.target === 'quote' && suggestion.relatedEntities[0]) {
      seed.entityId = suggestion.relatedEntities[0].id
    }
    if (suggestion.target === 'entity') {
      seed.entityName = suggestion.suggestedEntityName ?? undefined
      seed.entityType = suggestion.suggestedEntityType ?? undefined
    }
    onPromote(r, suggestion.target, seed)
  }

  return (
    <li className="group relative card-paper-soft p-4 pt-3">
      <div aria-hidden className="mb-2.5">
        <div className="border-t-2 border-ink-700/60" />
        <div className="mt-0.5 border-t border-ink-200" />
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-serif text-sm font-medium text-ink-700">
          {r.sourceTitle ?? host ?? 'recorte'}
          {r.sourceAuthor && (
            <span className="font-sans font-normal text-ink-400">
              {' '}
              — {r.sourceAuthor}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {r.captureMode && r.captureMode !== 'citation' && (
            <span className="rounded-sm bg-ink-700/5 px-1.5 py-0.5 text-micro uppercase tracking-wider text-ink-400">
              {CAPTURE_MODE_LABEL[r.captureMode]}
            </span>
          )}
          <span className="-rotate-2 rounded-sm border border-ink-200 px-1.5 py-0.5 text-micro uppercase tracking-wider text-ink-400 tabular-nums">
            {formatStamp(r.capturedAt ?? r.createdAt)}
          </span>
        </span>
      </div>

      <RecorteImage recorte={r} />

      <p className="mt-1.5 whitespace-pre-wrap font-serif text-lead leading-relaxed text-ink-700">
        {r.captureMode === 'html' || r.captureMode === 'article'
          ? markdownToPreview(r.text)
          : `«${r.text}»`}
      </p>

      {r.note && <p className="mt-2 marginalia-script">{r.note}</p>}

      {suggestion && <SuggestionBanner suggestion={suggestion} onUse={useSuggestion} />}

      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        {r.sourceUrl && (
          <a
            href={r.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-micro hover:underline"
            style={{ color: 'var(--accent-primary)' }}
          >
            ver original{host ? ` · ${host}` : ''}
          </a>
        )}
        {r.status === 'promoted' && r.promotedTarget && (
          <span className="text-micro uppercase tracking-eyebrow text-ink-300">
            → {TARGET_LABEL[r.promotedTarget]}
          </span>
        )}

        <span className="ml-auto flex items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {r.status === 'pending' && (
            <>
              {!suggestion && (
                <button
                  onClick={handleSuggest}
                  disabled={suggest.isPending}
                  className="inline-flex items-center gap-1 text-micro text-[color:var(--accent-gold)] hover:text-ink-700 transition-colors disabled:opacity-50"
                >
                  <SparkleIcon size={11} />
                  {suggest.isPending ? 'pensando…' : 'sugerir'}
                </button>
              )}
              {hasImage && (
                <button
                  onClick={handleOcr}
                  disabled={ocrBusy}
                  className="text-micro text-ink-400 hover:text-ink-700 transition-colors disabled:opacity-50"
                  title="Reconocer el texto de la imagen"
                >
                  {ocrBusy ? 'leyendo…' : 'extraer texto'}
                </button>
              )}
              {(['quote', 'entity', 'momento'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => onPromote(r, t)}
                  className="text-micro text-ink-400 hover:text-ink-700 transition-colors"
                >
                  → {TARGET_LABEL[t]}
                </button>
              ))}
              <button
                onClick={onArchive}
                className="text-micro text-ink-400 hover:text-ink-700 transition-colors"
              >
                archivar
              </button>
            </>
          )}
          {r.status === 'archived' && (
            <button
              onClick={onRestore}
              className="text-micro text-ink-400 hover:text-ink-700 transition-colors"
            >
              volver a pendientes
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-micro text-ink-300 hover:text-[color:var(--accent-clay)] transition-colors"
          >
            eliminar
          </button>
        </span>
      </div>
    </li>
  )
}
