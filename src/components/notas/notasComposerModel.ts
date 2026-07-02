import { extractUrl } from '../../lib/captureIntent'

export function resolveLinkDraft(draft: string, forceNote: boolean): string | null {
  return forceNote ? null : extractUrl(draft)
}

export function isNotasComposerActive({
  composerFocused,
  draft,
  title,
  pendingFilesCount,
}: {
  composerFocused: boolean
  draft: string
  title: string
  pendingFilesCount: number
}): boolean {
  return (
    composerFocused || draft.trim() !== '' || title.trim() !== '' || pendingFilesCount > 0
  )
}

export function isCaptureMediaFile(file: File): boolean {
  return file.type.startsWith('image/') || file.type.startsWith('video/')
}

export function captureMediaFilesFrom(files: File[]): File[] {
  return files.filter(isCaptureMediaFile)
}

export function pastedNoteImagesFrom(files: File[]): File[] {
  return files.filter((file) => file.type.startsWith('image/'))
}

export function composerDropUnsupportedMessage(files: File[]): string | null {
  if (files.length === 0) return null
  return captureMediaFilesFrom(files).length === 0
    ? 'Solo se pueden soltar imágenes o videos.'
    : null
}

export function captureMediaSuccessMessage(files: File[]): string {
  if (files.length !== 1) return `${files.length} archivos guardados en tus capturas.`
  return files[0]?.type.startsWith('video/')
    ? 'Video guardado en tus capturas.'
    : 'Imagen guardada en tus capturas.'
}

export function buildNotasComposerCta({
  draft,
  isLinkDraft,
  createNoteBusy,
  createRecorteBusy,
}: {
  draft: string
  isLinkDraft: boolean
  createNoteBusy: boolean
  createRecorteBusy: boolean
}): {
  disabled: boolean
  label: 'Guardar nota' | 'Guardar enlace' | 'Guardando…'
  mediaHint: string
} {
  const saving = createNoteBusy || createRecorteBusy
  return {
    disabled: saving || (!draft.trim() && !isLinkDraft),
    label: saving ? 'Guardando…' : isLinkDraft ? 'Guardar enlace' : 'Guardar nota',
    mediaHint: 'pega o suelta una imagen o video para capturarlo',
  }
}
