import { useLayoutEffect, useRef, useState } from 'react'
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
import { useLocalStorageState } from '../../hooks/useLocalStorageState'
import {
  ArrowRightIcon,
  ChevronDownIcon,
  EntitiesIcon,
  MomentosIcon,
  QuoteIcon,
  SparkleIcon,
  TextIcon,
  TrashIcon,
} from '../Icons'
import { OverflowMenu, OverflowMenuItem } from '../OverflowMenu'
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

// Alto (px) a partir del cual el texto de una captura se colapsa con un botón
// sin palabras. Más corto que la nota (~6-7 líneas): una captura no debe
// dominar la lista; lo extenso se promueve, no se lee entero acá.
const COLLAPSED_MAX_PX = 168

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
  // Confirmación de primer uso del 1-toque (la IA crea el objeto). Una vez
  // aceptada queda recordada y «curar» vuelve a ser de verdad un toque.
  const [curarConfirmed, setCurarConfirmed] = useLocalStorageState<'no' | 'yes'>(
    'trama.curar.confirmed',
    'no',
    (raw): raw is 'no' | 'yes' => raw === 'no' || raw === 'yes',
  )
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const hasImage = !!(r.imageKey || r.imageUrl)

  // Colapso del cuerpo: igual que NoteCard, las capturas largas se recortan a
  // unas pocas líneas y se abren con un botón sin palabras (chevron).
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const bodyRef = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    setOverflowing(el.scrollHeight > COLLAPSED_MAX_PX + 12)
  }, [r.text, r.captureMode])

  function onCurarClick() {
    if (curarConfirmed === 'yes') void handleOneTap()
    else setConfirming(true)
  }

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
    <li className="group relative card-paper-soft rounded-xl border border-ink-100/70 p-3.5 transition-shadow hover:shadow-sm">
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

      <div className="relative">
        <p
          ref={bodyRef}
          className="mt-1.5 overflow-hidden whitespace-pre-wrap font-serif text-lead leading-relaxed text-ink-700"
          style={overflowing && !expanded ? { maxHeight: COLLAPSED_MAX_PX } : undefined}
        >
          {r.captureMode === 'html' || r.captureMode === 'article'
            ? markdownToPreview(r.text)
            : `«${r.text}»`}
        </p>
        {overflowing && !expanded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-paper-100"
          />
        )}
      </div>

      {overflowing && (
        <div className="mt-1 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Mostrar menos' : 'Leer la captura completa'}
            title={expanded ? 'Mostrar menos' : 'Leer completa'}
            className="touch-target inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            <ChevronDownIcon
              size={16}
              className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      )}

      {r.note && <p className="mt-2 marginalia-script">{r.note}</p>}

      {confirming && (
        <div className="mt-2.5 rounded-md border border-[color:var(--accent-gold-soft)] bg-[color:var(--accent-gold-soft)] px-3 py-2">
          <p className="text-caption text-ink-600">
            La IA elegirá el destino y creará el objeto por ti. Siempre podrás deshacerlo.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={() => {
                setCurarConfirmed('yes')
                setConfirming(false)
                void handleOneTap()
              }}
              className="text-micro uppercase tracking-eyebrow text-ink-700 hover:text-ink-900 transition-colors"
            >
              Sí, curar
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {suggestion && <SuggestionBanner suggestion={suggestion} onUse={useSuggestion} />}

      {/* Pie: enlace al original + acción principal (curar) y un menú ⋯ con el
          resto de la triage. La cara queda tranquila; nada de fila de verbos. */}
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
            → {TARGET_LABEL[r.promotedTarget]}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {r.status === 'pending' && (
            <button
              onClick={onCurarClick}
              disabled={curating || promote.isPending}
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--accent-gold-soft)] bg-[color:var(--accent-gold-soft)] px-2.5 py-0.5 text-micro font-medium text-[color:var(--accent-gold)] transition-colors hover:text-ink-700 disabled:opacity-50"
              title="Deja que la IA elija el destino y lo cure en un toque"
            >
              <SparkleIcon size={11} />
              {curating || promote.isPending ? 'curando…' : 'curar'}
            </button>
          )}
          {r.status === 'archived' && (
            <button
              onClick={onRestore}
              className="text-micro text-ink-400 hover:text-ink-700 transition-colors"
            >
              volver a pendientes
            </button>
          )}

          <OverflowMenu
            label="Acciones del recorte"
            width="w-52"
            triggerClassName="touch-target rounded p-1 text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            {(close) => (
              <>
                {r.status === 'pending' && (
                  <>
                    <OverflowMenuItem
                      onClick={() => {
                        onPromote(r, 'quote')
                        close()
                      }}
                    >
                      <QuoteIcon size={13} /> → cita
                    </OverflowMenuItem>
                    <OverflowMenuItem
                      onClick={() => {
                        onPromote(r, 'entity')
                        close()
                      }}
                    >
                      <EntitiesIcon size={13} /> → entidad
                    </OverflowMenuItem>
                    <OverflowMenuItem
                      onClick={() => {
                        onPromote(r, 'momento')
                        close()
                      }}
                    >
                      <MomentosIcon size={13} /> → momento
                    </OverflowMenuItem>
                    {!suggestion && (
                      <OverflowMenuItem
                        onClick={() => {
                          void handleSuggest()
                          close()
                        }}
                        disabled={suggest.isPending}
                      >
                        <SparkleIcon size={13} />{' '}
                        {suggest.isPending ? 'pensando…' : 'sugerir destino'}
                      </OverflowMenuItem>
                    )}
                    {hasImage && (
                      <OverflowMenuItem
                        onClick={() => {
                          void handleOcr()
                          close()
                        }}
                        disabled={ocrBusy}
                      >
                        <TextIcon size={13} /> {ocrBusy ? 'leyendo…' : 'extraer texto'}
                      </OverflowMenuItem>
                    )}
                    <OverflowMenuItem
                      onClick={() => {
                        onArchive()
                        close()
                      }}
                    >
                      Archivar
                    </OverflowMenuItem>
                  </>
                )}

                {deleting ? (
                  <>
                    <OverflowMenuItem
                      danger
                      onClick={() => {
                        onDelete()
                        close()
                      }}
                    >
                      <TrashIcon size={13} /> Sí, eliminar
                    </OverflowMenuItem>
                    <OverflowMenuItem onClick={() => setDeleting(false)}>
                      Cancelar
                    </OverflowMenuItem>
                  </>
                ) : (
                  <OverflowMenuItem danger onClick={() => setDeleting(true)}>
                    <TrashIcon size={13} /> Eliminar
                  </OverflowMenuItem>
                )}
              </>
            )}
          </OverflowMenu>
        </div>
      </div>
    </li>
  )
}
