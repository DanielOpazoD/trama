import { useLayoutEffect, useRef, useState } from 'react'
import { type Recorte, type RecorteSuggestion, type RecorteTarget } from '../../api'
import { recorteImageUrl } from '../../api/recortes'
import { requestBlob } from '../../api/request'
import { useSuggestRecorte, useUpdateRecorte } from '../../state'
import { useToast } from '../../state/toast'
import { ArrowRightIcon } from '../Icons'
import { WhatsAppSourceTag } from '../WhatsAppSourceTag'
import { hostOf, RecorteMediaPreview, type LinkMediaSize } from './RecorteMediaPreview'
import { RecorteLightbox } from './RecorteLightbox'
import { recorteToLightboxEntries } from './recorteViewer'
import type { PromoteSeed } from './PromoteModal'
import { RecorteSuggestionBanner } from './RecorteSuggestionBanner'
import {
  buildRecorteCardFlags,
  buildPromoteSeedFromSuggestion,
  formatRecorteStamp,
  looksLikePlaceholder,
  recorteCaptureModeLabel,
  recorteTargetLabel,
} from './recorteCardModel'
import { RecorteCardBody } from './RecorteCardBody'
import { RecorteCardMenu } from './RecorteCardMenu'

// Alto (px) a partir del cual el texto de una captura se colapsa con un botón
// sin palabras. Más corto que la nota (~6-7 líneas): una captura no debe
// dominar la lista; lo extenso se promueve, no se lee entero acá.

/**
 * Baja la imagen del recorte como File para pasarla al OCR. Prefiere el blob
 * interno authed (imageKey, vía requestBlob con Bearer); si no, la URL externa.
 */
async function fetchRecorteImageFile(r: Recorte): Promise<File> {
  if (r.imageKey) {
    const blob = await requestBlob(recorteImageUrl(r.imageKey))
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

export function RecorteCard({
  recorte: r,
  thumbSize = 'mediana',
  onPromote,
  onArchive,
  onRestore,
  onDelete,
  onSendImagesToPdf,
}: {
  recorte: Recorte
  /** Tamaño de la miniatura de imagen (preferencia del feed). */
  thumbSize?: LinkMediaSize
  onPromote: (recorte: Recorte, target: RecorteTarget, seed?: PromoteSeed) => void
  onArchive: () => void
  onRestore: () => void
  onDelete: () => void
  onSendImagesToPdf?: (recorte: Recorte) => void
}) {
  const host = hostOf(r.sourceUrl)
  // Visor de la(s) imagen(es) propia(s) (doble clic en la miniatura) — misma
  // sala oscura que Momentos. Un recorte-evento abre TODAS sus imágenes.
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)
  const viewerEntries = recorteToLightboxEntries(r)
  const suggest = useSuggestRecorte()
  const update = useUpdateRecorte()
  const toast = useToast()
  const [suggestion, setSuggestion] = useState<RecorteSuggestion | null>(null)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // ¿Hay alguna imagen (propia o derivada de YouTube) que muestre el marco?
  // Si no, el origen se anuncia como eyebrow discreto sobre el título.
  const { hasImage, hasInternalImage, hasPreview } = buildRecorteCardFlags(r)
  const dateLabel = formatRecorteStamp(r.capturedAt ?? r.createdAt)

  // Colapso del cuerpo: igual que NoteCard, las capturas largas se recortan a
  // unas pocas líneas y se abren con un botón sin palabras (chevron).
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const bodyRef = useRef<HTMLParagraphElement>(null)
  // Sólo se mide EN PLEGADO: expandido el elemento no recorta nada, la
  // comparación daría `false` y desaparecería el botón de «Mostrar menos».
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el || expanded) return
    setOverflowing(el.scrollHeight > el.clientHeight + 1)
  }, [r.text, r.captureMode, expanded])

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
    onPromote(r, suggestion.target, buildPromoteSeedFromSuggestion(suggestion))
  }

  return (
    <li className="group relative card-paper-soft rounded-xl border border-ink-100/70 p-3.5 transition-shadow hover:shadow-sm">
      {/* Desde `md` la miniatura va al LADO del texto. Apilada, la tarjeta medía
          lo mismo a 375 que a 1280px: la miniatura se quedaba en 258px dentro
          de una fila de 930 y el texto caía debajo, desperdiciando 672px de
          ancho por tarjeta. En móvil se sigue apilando, que ahí es lo correcto. */}
      <div className="md:flex md:items-start md:gap-4">
        {hasPreview ? (
          <RecorteMediaPreview
            recorte={r}
            host={host}
            size={thumbSize}
            className="md:mb-0 md:shrink-0"
            onOpenImage={
              viewerEntries.length > 0
                ? () => {
                    setViewerIndex(0)
                    setViewerOpen(true)
                  }
                : undefined
            }
          />
        ) : (
          (host || dateLabel) && (
            <p className="mb-1.5 text-micro uppercase tracking-eyebrow text-ink-300">
              {host}
              {host && dateLabel && ' · '}
              {dateLabel && <span className="tabular-nums">{dateLabel}</span>}
            </p>
          )
        )}

        <div className="min-w-0 md:flex-1">
          {/* La etiqueta de tipo va PEGADA al título, no repartida al extremo
              opuesto: con `justify-between` acababa a 617px de la imagen que
              describía, y una etiqueta tan lejos de su sujeto no etiqueta. */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="min-w-0 font-serif text-xl font-medium leading-tight text-ink-700">
              {r.sourceTitle ?? host ?? 'recorte'}
              {r.sourceAuthor && (
                <span className="font-sans text-body font-normal text-ink-400">
                  {' '}
                  — {r.sourceAuthor}
                </span>
              )}
              <WhatsAppSourceTag source={r.captureSource} />
            </span>
            {r.captureMode && r.captureMode !== 'citation' && (
              <span className="shrink-0 rounded-sm bg-ink-700/5 px-1.5 py-0.5 text-micro uppercase tracking-eyebrow text-ink-400">
                {recorteCaptureModeLabel(r.captureMode)}
              </span>
            )}
          </div>

          <RecorteCardBody
            recorte={r}
            bodyRef={bodyRef}
            overflowing={overflowing}
            expanded={expanded}
            onExpandedChange={setExpanded}
          />

          {r.note && <p className="mt-2 marginalia-script">{r.note}</p>}

          {suggestion && (
            <RecorteSuggestionBanner suggestion={suggestion} onUse={useSuggestion} />
          )}
        </div>
      </div>

      {/* Pie: enlace al original a la izquierda + menú ⋯ a la derecha con toda
          la triage (→ Cita / → Entidad / → Momento, sugerir, extraer, archivar,
          eliminar). La cara queda tranquila; nada de fila de verbos. */}
      <div className="mt-3 flex items-center gap-3">
        {r.sourceUrl && (
          <a
            href={r.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-micro hover:underline"
            style={{ color: 'var(--accent-primary)' }}
          >
            ver original
            <ArrowRightIcon size={10} className="-rotate-45" />
          </a>
        )}
        {r.status === 'promoted' && r.promotedTarget && (
          <span className="text-micro uppercase tracking-eyebrow text-ink-300">
            → {recorteTargetLabel(r.promotedTarget)}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {r.status === 'archived' && (
            <button
              onClick={onRestore}
              className="text-micro text-ink-400 hover:text-ink-700 transition-colors"
            >
              volver a pendientes
            </button>
          )}

          <RecorteCardMenu
            recorte={r}
            suggestionReady={!!suggestion}
            suggestBusy={suggest.isPending}
            ocrBusy={ocrBusy}
            hasImage={hasImage}
            hasInternalImage={hasInternalImage}
            deleting={deleting}
            onPromote={onPromote}
            onSuggest={() => void handleSuggest()}
            onOcr={() => void handleOcr()}
            onArchive={onArchive}
            onDelete={onDelete}
            onCancelDelete={() => setDeleting(false)}
            onStartDelete={() => setDeleting(true)}
            onSendImagesToPdf={onSendImagesToPdf}
          />
        </div>
      </div>

      {viewerEntries.length > 0 && (
        <RecorteLightbox
          entries={viewerEntries}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </li>
  )
}
