import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalOverlay } from '../../hooks/useModalOverlay'
import { ChevronLeftIcon, ChevronRightIcon } from '../Icons'
import { CloseButton } from '../CloseButton'
import { IconButton } from '../IconButton'
import {
  AuthenticatedMomentoImage,
  AuthenticatedMomentoVideo,
  MomentoVideoThumb,
} from './AuthenticatedMedia'
import { isVideoItem, type MomentoPhotoItem } from './helpers'
import { VideoPlayBadge } from './VideoPlayBadge'

/**
 * AA-C / τ-IA: visor dedicado de fotos de un momento — lightbox de galería.
 *
 * Rediseño hacia un visor "de sala oscura", más profesional:
 *   - Fondo negro casi total con una viñeta radial sutil (profundidad de
 *     cine, no el ink semitransparente de antes).
 *   - Chrome que no compite con la foto: degradados arriba/abajo, controles
 *     con iconos reales (chevrons + cerrar), y un filmstrip de miniaturas.
 *   - Zoom con paneo: clic en la foto alterna ajustar ↔ ampliar; ampliada,
 *     se arrastra/scrollea para recorrerla. El cursor lo anticipa.
 *   - El margen negro alrededor de la foto cierra el visor (clic); la foto no.
 *
 * Controles:
 *   - ‹ / › (botones o flechas del teclado): navegar (resetea el zoom)
 *   - clic en la foto: zoom in/out · ESC o clic en el margen: cerrar
 *   - clic en una miniatura: saltar a esa foto
 */
export function PhotoLightbox({
  photos,
  initialIndex = 0,
  caption,
  open,
  onClose,
}: {
  photos: MomentoPhotoItem[]
  initialIndex?: number
  caption?: string
  open: boolean
  onClose: () => void
}) {
  const [active, setActive] = useState(initialIndex)
  const [zoomed, setZoomed] = useState(false)
  const visible = open && photos.length > 0
  const overlay = useModalOverlay({ open: visible, onClose })

  // Navegar siempre resetea el zoom — ver una foto nueva ampliada al azar
  // desorienta.
  const go = useCallback((next: number) => {
    setZoomed(false)
    setActive(next)
  }, [])
  const prev = useCallback(
    () => go(active === 0 ? photos.length - 1 : active - 1),
    [active, photos.length, go],
  )
  const next = useCallback(
    () => go(active === photos.length - 1 ? 0 : active + 1),
    [active, photos.length, go],
  )

  // Reset al re-abrir con un initialIndex distinto.
  useEffect(() => {
    if (open) {
      setActive(initialIndex)
      setZoomed(false)
    }
  }, [open, initialIndex])

  // Atajos teclado.
  useEffect(() => {
    if (!visible) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, prev, next])

  if (!visible || typeof document === 'undefined') return null
  const current = photos[active]
  if (!current) return null
  const currentIsVideo = isVideoItem(current)
  const multi = photos.length > 1

  return createPortal(
    <>
      {/* Fondo: negro casi total + viñeta radial para dar profundidad. Clic
          cierra. */}
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
        ref={overlay.dialogRef}
        role="dialog"
        aria-label="Visor de fotos"
        aria-modal="true"
        className="fixed inset-0 z-50 flex flex-col pointer-events-none animate-fade-up"
      >
        {/* Barra superior: degradado + caption / contador / controles. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent">
          <div className="pointer-events-auto flex items-center gap-4 px-4 py-3">
            <p className="min-w-0 flex-1 truncate font-serif italic text-sm text-white/70">
              {caption ?? ''}
            </p>
            {multi && (
              <span className="shrink-0 text-caption tabular-nums text-white/60">
                {active + 1} / {photos.length}
              </span>
            )}
            <div className="flex-1 flex justify-end">
              <CloseButton
                onClick={onClose}
                size={18}
                className="size-9 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Área del medio. El contenedor deja pasar los clics al fondo
            (cerrar) salvo cuando la foto está ampliada (ahí captura para
            scrollear). El video no hace zoom: se reproduce con sus
            controles y el margen sigue cerrando. */}
        <div
          className={`flex-1 w-full min-h-0 flex ${
            !currentIsVideo && zoomed
              ? 'overflow-auto pointer-events-auto'
              : 'overflow-hidden pointer-events-none items-center justify-center'
          } ${currentIsVideo ? 'p-4' : ''}`}
        >
          {currentIsVideo ? (
            <AuthenticatedMomentoVideo
              key={current.storageKey}
              storageKey={current.storageKey}
              controls
              autoPlay
              playsInline
              className="m-auto max-w-full max-h-full pointer-events-auto rounded-md bg-black shadow-2xl shadow-black/60"
            />
          ) : (
            <AuthenticatedMomentoImage
              key={current.storageKey}
              storageKey={current.storageKey}
              alt={caption ?? `foto ${active + 1} de ${photos.length}`}
              onClick={() => setZoomed((z) => !z)}
              draggable={false}
              className={`m-auto select-none pointer-events-auto shadow-2xl shadow-black/60 ${
                zoomed
                  ? 'max-w-none cursor-zoom-out'
                  : 'max-w-full max-h-full object-contain cursor-zoom-in'
              }`}
              style={
                zoomed ? { height: '170vh', width: 'auto', maxHeight: 'none' } : undefined
              }
            />
          )}
        </div>

        {/* Flechas laterales. */}
        {multi && (
          <>
            <IconButton
              onClick={prev}
              label="Foto anterior"
              className="pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2 z-10 size-12 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronLeftIcon size={22} />
            </IconButton>
            <IconButton
              onClick={next}
              label="Foto siguiente"
              className="pointer-events-auto absolute right-3 top-1/2 -translate-y-1/2 z-10 size-12 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronRightIcon size={22} />
            </IconButton>
          </>
        )}

        {/* Filmstrip inferior: degradado + miniaturas. */}
        {multi && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/75 to-transparent pt-10 pb-4">
            <div className="pointer-events-auto flex justify-center gap-1.5 overflow-x-auto px-4">
              {photos.map((p, idx) => (
                <button
                  key={p.storageKey}
                  onClick={() => go(idx)}
                  aria-label={
                    isVideoItem(p)
                      ? `Mostrar video ${idx + 1}`
                      : `Mostrar foto ${idx + 1}`
                  }
                  aria-current={idx === active ? 'true' : undefined}
                  className={`relative shrink-0 size-14 rounded-sm overflow-hidden ring-2 transition-all duration-200 ${
                    idx === active
                      ? 'ring-white opacity-100 scale-105'
                      : 'ring-transparent opacity-45 hover:opacity-90'
                  }`}
                >
                  {isVideoItem(p) ? (
                    <>
                      <MomentoVideoThumb
                        storageKey={p.storageKey}
                        posterStorageKey={p.posterStorageKey}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      <VideoPlayBadge size="sm" />
                    </>
                  ) : (
                    <AuthenticatedMomentoImage
                      storageKey={p.storageKey}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      className="w-full h-full object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>,
    document.body,
  )
}
