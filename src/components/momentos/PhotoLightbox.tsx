import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

/**
 * AA-C: visor dedicado de fotos de un momento (lightbox).
 *
 * Antes la galería vivía inline en el timeline — foto activa grande +
 * thumbs + flechas. Ocupaba mucho espacio vertical en momentos con
 * varias fotos. Ahora en el timeline solo se muestra la PRIMERA foto
 * con un badge "+N" si hay más; al click se abre este lightbox modal
 * con todas las fotos en pleno tamaño.
 *
 * Controles:
 *   - ‹ / › (botones y flechas izquierda/derecha del teclado): navegar
 *   - ESC: cerrar
 *   - Click backdrop: cerrar
 *   - Click en un thumb: saltar a esa foto
 */
export function PhotoLightbox({
  photos,
  initialIndex = 0,
  caption,
  open,
  onClose,
}: {
  photos: Array<{ storageKey: string; width?: number; height?: number }>
  initialIndex?: number
  caption?: string
  open: boolean
  onClose: () => void
}) {
  const [active, setActive] = useState(initialIndex)
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, open)

  // Reset al re-abrir con un initialIndex distinto.
  useEffect(() => {
    if (open) setActive(initialIndex)
  }, [open, initialIndex])

  // Atajos teclado.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft')
        setActive((i) => (i === 0 ? photos.length - 1 : i - 1))
      else if (e.key === 'ArrowRight')
        setActive((i) => (i === photos.length - 1 ? 0 : i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, photos.length, onClose])

  if (!open || photos.length === 0) return null
  const current = photos[active]

  return (
    <>
      <button
        onClick={onClose}
        aria-label="Cerrar visor"
        className="fixed inset-0 z-40 bg-ink-900/85 backdrop-blur-sm cursor-default animate-fade-up"
        tabIndex={-1}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-label="Visor de fotos"
        aria-modal="true"
        className="fixed inset-0 z-50 flex flex-col items-center justify-center px-4 py-6 pointer-events-none animate-fade-up"
      >
        {/* Counter arriba */}
        <div className="pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2 text-paper-50/85 text-caption tabular-nums">
          {active + 1} / {photos.length}
        </div>
        {/* Cerrar arriba derecha */}
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="pointer-events-auto absolute top-4 right-4 size-9 flex items-center justify-center rounded-full bg-ink-900/40 text-paper-50 hover:bg-ink-900/60 transition-colors"
        >
          ×
        </button>

        {/* Imagen grande — max altura para dejar espacio a thumbs/caption */}
        <div className="pointer-events-auto flex-1 flex items-center justify-center w-full min-h-0 max-h-full">
          <img
            key={current.storageKey}
            src={`/api/momentos-file/${encodeURIComponent(current.storageKey)}`}
            alt={caption ?? `foto ${active + 1} de ${photos.length}`}
            className="max-w-full max-h-full object-contain rounded select-none"
            style={{ maxHeight: 'calc(100vh - 12rem)' }}
          />
        </div>

        {/* Flechas laterales */}
        {photos.length > 1 && (
          <>
            <button
              onClick={() =>
                setActive((i) => (i === 0 ? photos.length - 1 : i - 1))
              }
              aria-label="Foto anterior"
              className="pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2 size-11 flex items-center justify-center rounded-full bg-ink-900/40 text-paper-50 hover:bg-ink-900/60 transition-colors text-2xl leading-none"
            >
              ‹
            </button>
            <button
              onClick={() =>
                setActive((i) => (i === photos.length - 1 ? 0 : i + 1))
              }
              aria-label="Foto siguiente"
              className="pointer-events-auto absolute right-3 top-1/2 -translate-y-1/2 size-11 flex items-center justify-center rounded-full bg-ink-900/40 text-paper-50 hover:bg-ink-900/60 transition-colors text-2xl leading-none"
            >
              ›
            </button>
          </>
        )}

        {/* Caption + thumbs abajo */}
        <div className="pointer-events-auto absolute bottom-4 inset-x-4 flex flex-col items-center gap-2">
          {caption && (
            <p className="text-paper-50/85 font-serif italic text-sm max-w-prose text-center px-4">
              {caption}
            </p>
          )}
          {photos.length > 1 && (
            <div className="flex gap-1 overflow-x-auto max-w-full px-2 py-1">
              {photos.map((p, idx) => (
                <button
                  key={p.storageKey}
                  onClick={() => setActive(idx)}
                  aria-label={`Mostrar foto ${idx + 1}`}
                  aria-current={idx === active ? 'true' : undefined}
                  className={`shrink-0 size-14 rounded overflow-hidden border-2 transition-all ${
                    idx === active
                      ? 'border-paper-50 opacity-100'
                      : 'border-transparent opacity-50 hover:opacity-100'
                  }`}
                >
                  <img
                    src={`/api/momentos-file/${encodeURIComponent(p.storageKey)}`}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
