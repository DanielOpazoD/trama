import { useEffect, useRef, useState } from 'react'
import { useEntitiesQuery, useQuotesQuery } from '../../state'
import { useToast } from '../../state/toast'
import { downloadBlob } from '../../lib/downloadBlob'
import { CloseIcon, ReadingIcon } from '../Icons'
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const favoriteCount = quotes.filter((q) => q.pinnedAt).length
  const effectiveQuotes = onlyFavorites ? quotes.filter((q) => q.pinnedAt) : quotes
  const voices = new Set(effectiveQuotes.map((q) => q.entityId)).size

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
        role="dialog"
        aria-label="Mi libro"
        className="fixed inset-x-4 top-16 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[460px] z-50 flex flex-col rounded-xl border border-ink-100/50 bg-paper-50/95 backdrop-blur-md shadow-lg shadow-ink-900/10 overflow-hidden animate-slide-up"
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
            <p className="mt-1 text-xs text-ink-400 leading-relaxed">
              {quotes.length} citas · {voices} {voices === 1 ? 'voz' : 'voces'} — portada,
              colofón, un capítulo por voz e índice onomástico, en A5 listo para imprimir.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
            className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors shrink-0"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <label className="block text-caption text-ink-700">
            Título
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              className="input-paper mt-1 block h-9 w-full rounded-md border border-ink-200 px-2.5 font-serif text-sm"
              placeholder="Florilegio"
            />
          </label>
          <label className="block text-caption text-ink-700">
            Autor{' '}
            <span className="text-ink-300">(opcional — tu nombre en la portada)</span>
            <input
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
              />
              edición breve: solo favoritas ★ ({favoriteCount})
            </label>
          )}

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
          </span>
          <button
            onClick={handlePreview}
            disabled={busy || effectiveQuotes.length === 0}
            className="text-xs uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors disabled:opacity-40"
          >
            previsualizar
          </button>
          <button
            onClick={handleCompose}
            disabled={busy || effectiveQuotes.length === 0}
            className="btn-accent text-xs"
          >
            {busy ? 'componiendo…' : 'componer libro'}
          </button>
        </footer>
      </div>
    </>
  )
}
