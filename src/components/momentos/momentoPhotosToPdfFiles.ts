import type { Momento } from '../../types'
import { getMomentoPhotoItems, isVideoItem, momentoMediaUrl } from './helpers'

export type MomentoPhotosToPdfFilesResult = {
  files: File[]
  failures: Array<{ key: string; reason: string }>
}

function fileName(storageKey: string, index: number): string {
  const leaf = storageKey.split('/').pop() || `foto-${index + 1}.jpg`
  return leaf.includes('.') ? leaf : `${leaf}.jpg`
}

/**
 * Las fotos de un momento como `File`, listas para Imprenta. Mismo contrato
 * que `recortesToPdfFiles`: lo que no se pudo bajar va a `failures`, no
 * tumba el envío. Los videos se saltan: Imprenta compone hojas, no clips.
 */
export async function momentoPhotosToPdfFiles(
  momento: Momento,
  { fetchBlob }: { fetchBlob: (url: string) => Promise<Blob> },
): Promise<MomentoPhotosToPdfFilesResult> {
  const files: File[] = []
  const failures: MomentoPhotosToPdfFilesResult['failures'] = []
  const items = getMomentoPhotoItems(momento.payload).filter((item) => !isVideoItem(item))
  for (const [index, item] of items.entries()) {
    try {
      const blob = await fetchBlob(momentoMediaUrl(item.storageKey))
      files.push(
        new File([blob], fileName(item.storageKey, index), {
          type: blob.type || 'image/jpeg',
        }),
      )
    } catch (error) {
      failures.push({
        key: item.storageKey,
        reason: error instanceof Error ? error.message : 'No se pudo descargar',
      })
    }
  }
  return { files, failures }
}

export function momentoHasPhotosForImprenta(momento: Momento): boolean {
  return getMomentoPhotoItems(momento.payload).some((item) => !isVideoItem(item))
}
