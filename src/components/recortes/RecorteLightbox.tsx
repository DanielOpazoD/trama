import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '../Icons'
import { useAuthenticatedMediaState } from '../momentos/AuthenticatedMedia'

export type RecorteImageEntry = { url: string; caption?: string | null }

/**
 * Visor de imágenes de capturas — misma "sala oscura" que el lightbox de
 * Momentos (PhotoLightbox), servido desde URLs authed genéricas
 * (`/api/recortes-image` o un `imageUrl` externo) vía `useAuthenticatedMediaState`.
 *
 * Acepta una LISTA de imágenes + índice: con una sola es el visor de una
 * tarjeta; con varias (la galería) habilita flechas ◀▶, teclado y contador.
 * Clic en la foto alterna ajustar ↔ ampliar; ESC o clic en el margen cierran.
 */
export function RecorteLightbox({
  entries,
  index,
  onIndexChange,
  open,
  onClose,
}: {
  entries: RecorteImageEntry[]
  index: number
  onIndexChange: (next: number) => void
  open: boolean
  onClose: () => void
}) {
  const [zoomed, setZoomed] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const total = entries.length
  const current = entries[index]
  const multi = total > 1
  useFocusTrap(dialogRef, open)
  useBodyScrollLock(open)
  const { src, status } = useAuthenticatedMediaState(open ? (current?.url ?? null) : null)

  useEffect(() => {
    setZoomed(false)
  }, [open, index])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && multi) onIndexChange((index - 1 + total) % total)
      else if (e.key === 'ArrowRight' && multi) onIndexChange((index + 1) % total)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, multi, index, total, onIndexChange, onClose])

  if (!open || typeof document === 'undefined' || !current) return null

  return createPortal(
    <>
      {/* Fondo "sala oscura": negro casi total + viñeta radial. Clic cierra. */}
      <button
        onClick={onClose}
        aria-label="Cerrar visor"
        tabIndex={-1}
        className="fixed inset-0 z-40 cursor-default animate-fade-up"
        style={{
          background:
            'radial-gradient(120% 120% at 50% 45%, rgba(10,10,12,0.94) 0%, rgba(0,0,0,0.985) 70%)',
        }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-label="Visor de imagen"
        aria-modal="true"
        className="fixed inset-0 z-50 flex flex-col pointer-events-none animate-fade-up"
      >
        {/* Barra superior: caption + contador + cerrar. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent">
          <div className="pointer-events-auto flex items-center gap-4 px-4 py-3">
            <p className="min-w-0 flex-1 truncate font-serif italic text-sm text-white/70">
              {current.caption ?? ''}
            </p>
            {multi && (
              <span className="shrink-0 text-caption tabular-nums text-white/60">
                {index + 1} / {total}
              </span>
            )}
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="size-9 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        {/* Área de la foto. El margen deja pasar el clic al fondo (cerrar). */}
        <div
          className={`flex-1 w-full min-h-0 flex ${
            zoomed
              ? 'overflow-auto pointer-events-auto'
              : 'overflow-hidden pointer-events-none'
          }`}
        >
          {status === 'ready' && src ? (
            <img
              key={current.url}
              src={src}
              alt={current.caption ?? 'imagen de la captura'}
              draggable={false}
              onClick={() => setZoomed((z) => !z)}
              className={`m-auto select-none pointer-events-auto shadow-2xl shadow-black/60 ${
                zoomed
                  ? 'max-w-none cursor-zoom-out'
                  : 'max-w-full max-h-full object-contain cursor-zoom-in'
              }`}
              style={
                zoomed ? { height: '170vh', width: 'auto', maxHeight: 'none' } : undefined
              }
            />
          ) : (
            <span className="m-auto text-caption text-white/60 pointer-events-auto">
              {status === 'error' ? 'No se pudo cargar la imagen' : 'cargando…'}
            </span>
          )}
        </div>

        {/* Flechas laterales (wrap), solo con varias imágenes. */}
        {multi && (
          <>
            <button
              onClick={() => onIndexChange((index - 1 + total) % total)}
              aria-label="Imagen anterior"
              className="pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2 z-10 size-12 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronLeftIcon size={22} />
            </button>
            <button
              onClick={() => onIndexChange((index + 1) % total)}
              aria-label="Imagen siguiente"
              className="pointer-events-auto absolute right-3 top-1/2 -translate-y-1/2 z-10 size-12 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronRightIcon size={22} />
            </button>
          </>
        )}
      </div>
    </>,
    document.body,
  )
}
