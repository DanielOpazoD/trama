import { CameraIcon, UploadIcon } from '../Icons'
import { IconButton } from '../IconButton'

/**
 * Pie del composer expandido: UNA sola fila serena — acciones de ícono a la
 * izquierda (adjuntar archivo, capturar imagen/video) con su pista sutil, y
 * el CTA de guardar a la derecha. Reemplaza al panel punteado de «anexos» y
 * al botón en mayúsculas: mismo poder, la mitad del ruido.
 */
export function NotasFeedComposerFooter({
  accent,
  mediaHint,
  ctaLabel,
  ctaDisabled,
  attachDisabled,
  captureDisabled,
  justSaved,
  onAttach,
  onCapture,
  onSave,
}: {
  accent: string
  mediaHint: string
  ctaLabel: string
  ctaDisabled: boolean
  attachDisabled: boolean
  captureDisabled: boolean
  justSaved: boolean
  onAttach: () => void
  onCapture: () => void
  onSave: () => void
}) {
  const iconBtn =
    'flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100/60 hover:text-ink-700 disabled:opacity-40'
  return (
    <div className="mt-2 flex items-center justify-between gap-3 border-t border-ink-100/60 pt-2 animate-fade-up">
      <div className="flex min-w-0 items-center gap-0.5">
        <IconButton
          label="Adjuntar archivo"
          title="Adjuntar archivo"
          disabled={attachDisabled}
          onClick={onAttach}
          className={iconBtn}
        >
          <UploadIcon size={13} />
        </IconButton>
        <IconButton
          label="Capturar imagen o video"
          title="Capturar imagen o video"
          disabled={captureDisabled}
          onClick={onCapture}
          className={iconBtn}
        >
          <CameraIcon size={13} />
        </IconButton>
        <span className="ml-1.5 hidden min-w-0 truncate text-micro text-ink-300 sm:block">
          {mediaHint}
        </span>
      </div>
      <div className="relative shrink-0">
        <button
          onClick={onSave}
          disabled={ctaDisabled}
          className="btn-ink text-xs disabled:opacity-40"
        >
          {ctaLabel}
        </button>
        {justSaved && (
          <span
            aria-hidden
            className="animate-saved-ripple pointer-events-none absolute inset-0 rounded-md"
            style={{ boxShadow: `0 0 0 2px ${accent}` }}
          />
        )}
      </div>
    </div>
  )
}
