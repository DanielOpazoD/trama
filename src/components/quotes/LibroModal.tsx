import { useEffect, useMemo, useRef, useState } from 'react'
import { useModalOverlay } from '../../hooks/useModalOverlay'
import { useEntitiesQuery, useQuotesQuery } from '../../state'
import { useToast } from '../../state/toast'
import { downloadBlob } from '../../lib/downloadBlob'
import { libroImprintSummary } from '../../lib/libro/libroModel'
import { ReadingIcon } from '../Icons'
import { CloseButton } from '../CloseButton'
import { WaitingVoice } from '../WaitingVoice'

/**
 * «Editar mi libro» — el florilegio como edición. El usuario titula su
 * libro, firma si quiere, decide si van sus marginalia, y Trama compone
 * un PDF de imprenta en A5: portada, colofón, un capítulo por entidad,
 * folios e índice onomástico. El compositor (`buildLibro`) se baja lazy
 * recién al pulsar «componer»; este modal es liviano.
 */
export function LibroModal({ onClose }: { onClose: () => void }) {
  const { data: quotes = [] } = useQuotesQuery()
  const { data: entities = [] } = useEntitiesQuery()
  const toast = useToast()

  const [title, setTitle] = useState('Florilegio')
  const [author, setAuthor] = useState('')
  const [includeMarginalia, setIncludeMarginalia] = useState(true)
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  // Vista previa: páginas de la edición recién compuesta. Los bytes se
  // cachean por opciones — descargar tras previsualizar no recompone.
  const [previewPages, setPreviewPages] = useState<string[] | null>(null)
  const cacheRef = useRef<{ key: string; bytes: Uint8Array } | null>(null)

  // Escape + focus trap + scroll-lock + restaurar foco al trigger, vía el
  // primitivo canónico. Mientras se compone (busy) Escape no cierra —
  // preserva el guard `!busy` que tenía el handler manual. El backdrop y los
  // botones de cierre mantienen su propio guard `busy` más abajo.
  const overlay = useModalOverlay({
    open: true,
    onClose,
    closeOnEscape: !busy,
  })

  const favoriteCount = quotes.filter((q) => q.pinnedAt).length
  const effectiveQuotes = onlyFavorites ? quotes.filter((q) => q.pinnedAt) : quotes
  const voices = new Set(effectiveQuotes.map((q) => q.entityId)).size
  const imprint = useMemo(
    () => libroImprintSummary(entities, quotes, { onlyFavorites }),
    [entities, quotes, onlyFavorites],
  )
  const composeLabel = previewPages ? 'descargar PDF' : 'componer PDF'

  const optionsKey = JSON.stringify({ title, author, includeMarginalia, onlyFavorites })
  useEffect(() => {
    // Cambió cualquier opción → la previa y el cache quedan viejos.
    setPreviewPages(null)
    cacheRef.current = null
  }, [optionsKey])

  async function composeBytes(): Promise<Uint8Array> {
    if (cacheRef.current?.key === optionsKey) return cacheRef.current.bytes
    const { buildLibroPdf } = await import('../../lib/libro/buildLibro')
    const bytes = await buildLibroPdf(
      entities,
      quotes,
      {
        title: title.trim() || 'Florilegio',
        author: author.trim() || null,
        includeMarginalia,
        onlyFavorites,
      },
      setStep,
    )
    cacheRef.current = { key: optionsKey, bytes }
    return bytes
  }

  async function handlePreview() {
    if (busy || effectiveQuotes.length === 0) return
    setBusy(true)
    try {
      const bytes = await composeBytes()
      setStep('hojeando la edición…')
      const { renderPdfPreviewPages } = await import('../../lib/libro/libroPreview')
      setPreviewPages(await renderPdfPreviewPages(bytes, 4))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo previsualizar'
      toast.show({ message: msg, tone: 'error' })
    } finally {
      setBusy(false)
      setStep(null)
    }
  }

  async function handleCompose() {
    if (busy || effectiveQuotes.length === 0) return
    setBusy(true)
    try {
      const bytes = await composeBytes()
      setStep('preparando descarga…')
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
      const slug = (title.trim() || 'florilegio')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40)
      downloadBlob(blob, `${slug || 'florilegio'}.pdf`)
      toast.show({ message: 'Tu libro está compuesto', tone: 'success' })
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo componer el libro'
      toast.show({ message: msg, tone: 'error' })
    } finally {
      setBusy(false)
      setStep(null)
    }
  }

  return (
    <>
      <button
        onClick={() => !busy && onClose()}
        aria-label="Cerrar"
        className="fixed inset-0 z-40 bg-ink-900/30 backdrop-blur-sm cursor-default"
        tabIndex={-1}
      />
      <div
        ref={overlay.dialogRef}
        role="dialog"
        aria-label="Mi libro"
        aria-modal="true"
        className="fixed inset-x-4 top-16 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[560px] z-50 flex flex-col rounded-xl border border-ink-100/50 bg-paper-50/95 backdrop-blur-md shadow-lg shadow-ink-900/10 overflow-hidden animate-slide-up"
      >
        <header className="px-5 py-4 border-b border-ink-100/60 flex items-baseline justify-between gap-3">
          <div>
            <p className="text-micro uppercase tracking-eyebrow text-ink-300 flex items-center gap-1.5">
              <ReadingIcon size={12} />
              mi libro
            </p>
            <h2 className="font-serif text-lg text-ink-700 mt-0.5">
              El florilegio como edición
            </h2>
            <p className="mt-1 text-caption text-ink-400 leading-relaxed">
              {quotes.length} citas · {voices} {voices === 1 ? 'voz' : 'voces'} — portada,
              colofón, un capítulo por voz e índice onomástico, en A5 listo para imprimir.
            </p>
          </div>
          <CloseButton
            onClick={onClose}
            disabled={busy}
            className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors shrink-0"
          />
        </header>

        <div className="max-h-[min(72vh,620px)] overflow-y-auto p-5 space-y-4">
          <label htmlFor="libro-titulo" className="block text-caption text-ink-700">
            Título
            <input
              id="libro-titulo"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              className="input-paper mt-1 block h-9 w-full rounded-md border border-ink-200 px-2.5 font-serif text-sm"
              placeholder="Florilegio"
            />
          </label>
          <label htmlFor="libro-autor" className="block text-caption text-ink-700">
            Autor{' '}
            <span className="text-ink-300">(opcional — tu nombre en la portada)</span>
            <input
              id="libro-autor"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              disabled={busy}
              className="input-paper mt-1 block h-9 w-full rounded-md border border-ink-200 px-2.5 font-serif text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-caption text-ink-500">
            <input
              type="checkbox"
              checked={includeMarginalia}
              onChange={(e) => setIncludeMarginalia(e.target.checked)}
              disabled={busy}
              className="accent-[var(--accent-primary)]"
              aria-label="Incluir mis reflexiones como marginalia manuscrita"
            />
            incluir mis reflexiones como marginalia manuscrita
          </label>
          {favoriteCount > 0 && (
            <label className="flex items-center gap-2 text-caption text-ink-500">
              <input
                type="checkbox"
                checked={onlyFavorites}
                onChange={(e) => setOnlyFavorites(e.target.checked)}
                disabled={busy}
                className="accent-[var(--accent-primary)]"
                aria-label="Edición breve: solo favoritas"
              />
              edición breve: solo favoritas ★ ({favoriteCount})
            </label>
          )}

          <section
            aria-label="Ficha de imprenta"
            className="-mx-5 border-y border-ink-100/70 bg-ink-50/45 px-5 py-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-micro uppercase tracking-eyebrow text-ink-300">
                  ficha de imprenta
                </p>
                <p className="mt-1 font-serif text-base text-ink-700">
                  {imprint.editionLabel} · {imprint.exportStateLabel}
                </p>
              </div>
              <p className="text-right text-micro uppercase tracking-eyebrow text-ink-300">
                A5
                <br />
                PDF
              </p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <div>
                <dt className="text-micro uppercase tracking-eyebrow text-ink-300">
                  citas
                </dt>
                <dd className="font-serif text-xl text-ink-700">
                  {imprint.quoteCount}
                  <span className="ml-1 text-sm text-ink-400">
                    {' '}
                    {imprint.quoteCount === 1 ? 'cita' : 'citas'}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-micro uppercase tracking-eyebrow text-ink-300">
                  voces
                </dt>
                <dd className="font-serif text-xl text-ink-700">
                  {imprint.voiceCount}
                  <span className="ml-1 text-sm text-ink-400">
                    {' '}
                    {imprint.voiceCount === 1 ? 'voz' : 'voces'}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-micro uppercase tracking-eyebrow text-ink-300">
                  fuentes
                </dt>
                <dd className="font-serif text-xl text-ink-700">
                  {imprint.sourceCount}
                  <span className="ml-1 text-sm text-ink-400">
                    {' '}
                    {imprint.sourceCount === 1 ? 'fuente' : 'fuentes'}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-micro uppercase tracking-eyebrow text-ink-300">
                  favoritas
                </dt>
                <dd className="font-serif text-xl text-ink-700">
                  {imprint.favoriteCount}
                  <span className="ml-1 text-sm text-ink-400">
                    {' '}
                    {imprint.favoriteCount === 1 ? 'favorita' : 'favoritas'}
                  </span>
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-caption text-ink-400">
              Reunidas en {imprint.yearRangeLabel}. Compuesto el {imprint.composedAtLabel}
              . Portada, colofón, capítulos e índice quedan incluidos en la exportación.
            </p>
          </section>

          {/* Vista previa — las primeras páginas de la edición, hojeables. */}
          {previewPages && (
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Vista previa">
              {previewPages.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`Página ${i + 1}`}
                  className="h-44 w-auto shrink-0 rounded-sm border border-ink-100 shadow-sm shadow-ink-900/10"
                />
              ))}
              <span className="self-end pb-1 font-serif italic text-micro text-ink-300">
                …
              </span>
            </div>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-ink-100/60 flex items-center justify-between gap-3">
          <span role="status" className="min-h-[1rem] text-caption">
            {busy && (
              <>
                <WaitingVoice
                  phrases={['entintando los tipos…', 'cosiendo los pliegos…']}
                  className="text-caption"
                />
                {step ? <span className="text-ink-300"> · {step}</span> : null}
              </>
            )}
            {!busy && (
              <span className="text-ink-300">
                {previewPages
                  ? 'Previsualizado · listo para descarga'
                  : imprint.exportStateLabel}
              </span>
            )}
          </span>
          <button
            onClick={handlePreview}
            disabled={busy || effectiveQuotes.length === 0}
            className="text-xs uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors disabled:opacity-40"
          >
            previsualizar PDF
          </button>
          <button
            onClick={handleCompose}
            disabled={busy || effectiveQuotes.length === 0}
            className="btn-accent text-xs"
          >
            {busy ? 'componiendo…' : composeLabel}
          </button>
        </footer>
      </div>
    </>
  )
}
