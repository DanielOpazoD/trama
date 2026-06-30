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

export function captureMediaSuccessMessage(files: File[]): string {
  if (files.length !== 1) return `${files.length} archivos guardados en tus capturas.`
  return files[0]?.type.startsWith('video/')
    ? 'Video guardado en tus capturas.'
    : 'Imagen guardada en tus capturas.'
}
