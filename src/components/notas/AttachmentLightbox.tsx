import { useEffect } from 'react'
import type { NotasAttachment } from '../../api'
import { useModalOverlay } from '../../hooks/useModalOverlay'
import { useAuthenticatedMediaState } from '../momentos/AuthenticatedMedia'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PencilIcon } from '../Icons'

/**
 * Visor continuo de las fotos de un anexo (semana/tarea): lightbox de "sala
 * oscura" —misma estética que el de Momentos— con flechas ◀▶ (y teclado) para
 * recorrer las imágenes, contador, y un botón "editar" que abre el editor
 * (recortar/girar/texto) sobre la foto actual.
 *
 * El índice lo controla el padre (`index`/`onIndexChange`): así, tras editar
 * —que re-sube la foto y borra la vieja— el padre puede reposicionar el visor
 * sobre el resultado. Mientras el editor está abierto encima, `interactive` se
 * pone en false para que el visor ignore las teclas (las maneja el editor).
 */
export function AttachmentLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
  onEdit,
  editing,
  interactive = true,
}: {
  photos: NotasAttachment[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
  onEdit: () => void
  editing: boolean
  interactive?: boolean
}) {
  const overlay = useModalOverlay({
    open: true,
    onClose,
    lockScroll: false,
    closeOnEscape: interactive,
  })

  const total = photos.length
  const current = photos[index]
  const multi = total > 1
  const { src, status } = useAuthenticatedMediaState(current?.url)

  // Teclado: flechas navegan (wrap). Solo cuando el visor manda
  // (no mientras el editor está abierto encima → interactive=false).
  // Escape queda delegado a useModalOverlay para respetar el stack de overlays.
  useEffect(() => {
    if (!interactive) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' && multi) {
        onIndexChange((index - 1 + total) % total)
      } else if (e.key === 'ArrowRight' && multi) {
        onIndexChange((index + 1) % total)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [interactive, index, total, multi, onIndexChange])

  if (!current) return null

  return (
    <>
      {/* Fondo "sala oscura": negro casi total con viñeta. Clic cierra. */}
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
        {/* Barra superior: nombre · contador · editar · cerrar. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent">
          <div className="pointer-events-auto flex items-center gap-3 px-4 py-3">
            <p className="min-w-0 flex-1 truncate font-serif italic text-sm text-white/70">
              {current.fileName}
            </p>
            {multi && (
              <span className="shrink-0 text-caption tabular-nums text-white/60">
                {index + 1} / {total}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onEdit}
                disabled={editing}
                aria-label="Editar foto"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-caption text-white/85 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-60 disabled:animate-pulse"
              >
                <PencilIcon size={14} /> {editing ? 'editando…' : 'editar'}
              </button>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="size-9 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <CloseIcon size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Área de la foto. Los márgenes dejan pasar el clic al fondo (cerrar);
            la imagen no. */}
        <div className="flex-1 w-full min-h-0 flex overflow-hidden pointer-events-none">
          {status === 'ready' && src ? (
            <img
              key={current.id}
              src={src}
              alt={current.fileName}
              draggable={false}
              className="m-auto max-w-full max-h-full object-contain select-none pointer-events-auto shadow-2xl shadow-black/60"
            />
          ) : (
            <span className="m-auto text-caption text-white/60 pointer-events-auto">
              {status === 'error' ? 'No se pudo cargar la imagen' : 'cargando…'}
            </span>
          )}
        </div>

        {/* Flechas laterales (wrap). */}
        {multi && (
          <>
            <button
              onClick={() => onIndexChange((index - 1 + total) % total)}
              aria-label="Foto anterior"
              className="pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2 z-10 size-12 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronLeftIcon size={22} />
            </button>
            <button
              onClick={() => onIndexChange((index + 1) % total)}
              aria-label="Foto siguiente"
              className="pointer-events-auto absolute right-3 top-1/2 -translate-y-1/2 z-10 size-12 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronRightIcon size={22} />
            </button>
          </>
        )}
      </div>
    </>
  )
}
