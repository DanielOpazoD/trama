import { useState } from 'react'
import { type Recorte, type RecorteSuggestion, type RecorteTarget } from '../../api'
import { recorteImageUrl } from '../../api/recortes'
import { apiFetch } from '../../api/request'
import {
  usePromoteRecorte,
  useUnpromoteRecorte,
  useSuggestRecorte,
  useUpdateRecorte,
} from '../../state'
import { useToast } from '../../state/toast'
import { SparkleIcon } from '../Icons'
import { WhatsAppSourceTag } from '../WhatsAppSourceTag'
import { useAuthenticatedMediaState } from '../momentos/AuthenticatedMedia'
import { hostOf, LinkMediaPreview } from './LinkMediaPreview'
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

function curationCueFor(r: Recorte): string {
  if (r.imageKey || r.imageUrl)
    return 'extrae texto si hace falta, o promuévelo como momento'
  if (r.captureMode === 'article' || r.captureMode === 'html') {
    return 'revisa la página y decide si queda como cita o momento'
  }
  return 'elige si será cita, entidad o momento'
}

// Pixel transparente mientras el blob authed viaja (evita el icono roto).
const TRANSPARENT_PX =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

function RecorteMediaPreview({
  recorte: r,
  host,
}: {
  recorte: Recorte
  host: string | null
}) {
  const authedSrc = r.imageKey ? recorteImageUrl(r.imageKey) : null
  const { src, status } = useAuthenticatedMediaState(authedSrc)
  const shown = authedSrc ? src : r.imageUrl

  return (
    <LinkMediaPreview
      href={r.imageKey ? null : (r.sourceUrl ?? r.imageUrl)}
      host={host}
      dateLabel={formatStamp(r.capturedAt ?? r.createdAt)}
      imageUrl={shown ?? (authedSrc ? TRANSPARENT_PX : r.imageUrl)}
      imageLoading={status === 'loading'}
      ariaLabel={r.sourceTitle ? `Abrir ${r.sourceTitle}` : undefined}
    />
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
  const promote = usePromoteRecorte()
  const unpromote = useUnpromoteRecorte()
  const update = useUpdateRecorte()
  const toast = useToast()
  const [suggestion, setSuggestion] = useState<RecorteSuggestion | null>(null)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [curating, setCurating] = useState(false)
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

  function seedFromSuggestion(s: RecorteSuggestion): PromoteSeed {
    const seed: PromoteSeed = { title: s.title }
    if (s.target === 'quote' && s.relatedEntities[0]) {
      const entity = s.relatedEntities[0]
      seed.entityId = entity.id
      seed.entityName = entity.name
      seed.entityType = entity.type
    }
    if (s.target === 'entity') {
      seed.entityName = s.suggestedEntityName ?? undefined
      seed.entityType = s.suggestedEntityType ?? undefined
    }
    return seed
  }

  function useSuggestion() {
    if (!suggestion) return
    onPromote(r, suggestion.target, seedFromSuggestion(suggestion))
  }

  /** Toast de promoción exitosa con Deshacer: revierte el objeto recién
   *  creado y devuelve el recorte a pendientes. Hace que el 1 toque sea
   *  confiable — crear sin red de seguridad asusta. */
  function showCuratedToast(message: string) {
    toast.show({
      message,
      tone: 'success',
      durationMs: 10_000,
      action: {
        label: 'Deshacer',
        onAction: async () => {
          try {
            await unpromote.mutateAsync(r.id)
            toast.show({ message: 'Promoción deshecha.', tone: 'success' })
          } catch (err) {
            toast.show({
              message: err instanceof Error ? err.message : 'No se pudo deshacer',
              tone: 'error',
            })
          }
        },
      },
    })
  }

  /**
   * Triage de 1 toque: pide la sugerencia (si no la hay) y promueve directo
   * cuando no faltan datos — momento siempre, entidad con nombre propuesto,
   * cita con una entidad relacionada. Si la cita necesita atribución manual,
   * abre el modal ya prellenado (un toque más, no se pierde el trabajo).
   */
  async function handleOneTap() {
    if (curating || promote.isPending) return
    setCurating(true)
    try {
      const s = suggestion ?? (await suggest.mutateAsync(r.id))
      setSuggestion(s)

      if (s.target === 'momento') {
        await promote.mutateAsync({
          id: r.id,
          input: {
            target: 'momento',
            momento: {
              kind: 'recorte',
              payload: {
                bodyText: r.text,
                url: r.sourceUrl ?? undefined,
                title: r.sourceTitle ?? undefined,
                author: r.sourceAuthor ?? undefined,
              },
              note: r.note,
              capturedAt: r.capturedAt ?? r.createdAt,
            },
          },
        })
        showCuratedToast(`Curado como momento: «${s.title}»`)
        return
      }

      if (s.target === 'entity' && s.suggestedEntityName) {
        await promote.mutateAsync({
          id: r.id,
          input: {
            target: 'entity',
            entity: {
              type: s.suggestedEntityType ?? 'concepto',
              name: s.suggestedEntityName,
              description: r.text.trim().slice(0, 280) || null,
            },
          },
        })
        showCuratedToast(`Curado como entidad: «${s.suggestedEntityName}»`)
        return
      }

      if (s.target === 'quote' && s.relatedEntities[0]) {
        const entity = s.relatedEntities[0]
        await promote.mutateAsync({
          id: r.id,
          input: {
            target: 'quote',
            quote: {
              entityId: entity.id,
              text: r.text.trim(),
              source: [r.sourceTitle, r.sourceAuthor].filter(Boolean).join(' · ') || null,
              link: r.sourceUrl,
            },
          },
        })
        showCuratedToast(`Curado como cita de ${entity.name}`)
        return
      }

      // La cita necesita que elijas a quién atribuirla → modal prellenado.
      onPromote(r, s.target, seedFromSuggestion(s))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo curar el recorte'
      toast.show({ message: msg, tone: 'error' })
    } finally {
      setCurating(false)
    }
  }

  return (
    <li className="group relative card-paper-soft p-4 pt-3 transition-shadow hover:shadow-sm">
      <div aria-hidden className="mb-2.5">
        <div className="border-t-2 border-ink-700/60" />
        <div className="mt-0.5 border-t border-ink-200" />
      </div>

      <RecorteMediaPreview recorte={r} host={host} />

      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 font-serif text-xl font-medium leading-tight text-ink-700">
          {r.sourceTitle ?? host ?? 'recorte'}
          {r.sourceAuthor && (
            <span className="font-sans text-sm font-normal text-ink-400">
              {' '}
              — {r.sourceAuthor}
            </span>
          )}
          <WhatsAppSourceTag source={r.captureSource} />
        </span>
        {r.captureMode && r.captureMode !== 'citation' && (
          <span className="shrink-0 rounded-sm bg-ink-700/5 px-1.5 py-0.5 text-micro uppercase tracking-wider text-ink-400">
            {CAPTURE_MODE_LABEL[r.captureMode]}
          </span>
        )}
      </div>

      <p className="mt-1.5 whitespace-pre-wrap font-serif text-lead leading-relaxed text-ink-700">
        {r.captureMode === 'html' || r.captureMode === 'article'
          ? markdownToPreview(r.text)
          : `«${r.text}»`}
      </p>

      {r.note && <p className="mt-2 marginalia-script">{r.note}</p>}

      {r.status === 'pending' && (
        <div
          aria-label="Siguiente curaduría"
          className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md border border-[color:var(--accent-gold-soft)] bg-[color:var(--accent-gold-soft)]/45 px-3 py-2"
        >
          <span className="text-micro uppercase tracking-eyebrow text-[color:var(--accent-gold)]">
            pendiente de curaduría
          </span>
          <span className="text-caption text-ink-500">{curationCueFor(r)}</span>
        </div>
      )}

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

        <span className="ml-auto flex items-center gap-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          {r.status === 'pending' && (
            <>
              <button
                onClick={handleOneTap}
                disabled={curating || promote.isPending}
                className="inline-flex items-center gap-1 rounded-full border border-[color:var(--accent-gold-soft)] bg-[color:var(--accent-gold-soft)] px-2 py-0.5 text-micro font-medium text-[color:var(--accent-gold)] transition-colors hover:text-ink-700 disabled:opacity-50"
                title="Deja que la IA elija el destino y lo cure en un toque"
              >
                <SparkleIcon size={11} />
                {curating || promote.isPending ? 'curando…' : 'curar'}
              </button>
              {!suggestion && (
                <button
                  onClick={handleSuggest}
                  disabled={suggest.isPending}
                  className="inline-flex items-center gap-1 text-micro text-ink-400 hover:text-ink-700 transition-colors disabled:opacity-50"
                >
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
