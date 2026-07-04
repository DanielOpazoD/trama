import { CameraIcon, UploadIcon } from '../Icons'
import { IconButton } from '../IconButton'
import { ComposerFooter, composerIconButtonClass } from './composerChrome'

/**
 * Pie del composer de capturas: el pie sereno compartido con las acciones
 * propias del feed (adjuntar archivo, capturar imagen/video).
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
  return (
    <ComposerFooter
      accent={accent}
      hint={mediaHint}
      ctaLabel={ctaLabel}
      ctaDisabled={ctaDisabled}
      justSaved={justSaved}
      onSave={onSave}
    >
      <IconButton
        label="Adjuntar archivo"
        title="Adjuntar archivo"
        disabled={attachDisabled}
        onPointerDown={(event) => event.preventDefault()}
        onClick={onAttach}
        className={composerIconButtonClass}
      >
        <UploadIcon size={13} />
      </IconButton>
      <IconButton
        label="Capturar imagen o video"
        title="Capturar imagen o video"
        disabled={captureDisabled}
        onPointerDown={(event) => event.preventDefault()}
        onClick={onCapture}
        className={composerIconButtonClass}
      >
        <CameraIcon size={13} />
      </IconButton>
    </ComposerFooter>
  )
}
