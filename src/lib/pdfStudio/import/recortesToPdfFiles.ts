import type { Recorte } from '../../../api'
import { recorteImageUrl } from '../../../api/recortes'

export type RecortePdfImportFailure = {
  key: string
  reason: string
}

export type RecortesToPdfFilesResult = {
  files: File[]
  failures: RecortePdfImportFailure[]
}

type RecortesToPdfFilesOptions = {
  fetchBlob: (url: string) => Promise<Blob>
}

export function imageKeysFromRecortes(recortes: Recorte[]): string[] {
  const keys = new Set<string>()
  for (const recorte of recortes) {
    for (const image of recorte.images) keys.add(image.storageKey)
    if (recorte.imageKey) keys.add(recorte.imageKey)
  }
  return [...keys]
}

function imageFileName(storageKey: string, index: number): string {
  const leaf = storageKey.split('/').pop() || `recorte-${index + 1}.jpg`
  return leaf.includes('.') ? leaf : `${leaf}.jpg`
}

function failureReason(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo descargar'
}

export async function recortesToPdfFiles(
  recortes: Recorte[],
  { fetchBlob }: RecortesToPdfFilesOptions,
): Promise<RecortesToPdfFilesResult> {
  const files: File[] = []
  const failures: RecortePdfImportFailure[] = []
  const keys = imageKeysFromRecortes(recortes)

  for (const [index, key] of keys.entries()) {
    try {
      const blob = await fetchBlob(recorteImageUrl(key))
      files.push(
        new File([blob], imageFileName(key, index), {
          type: blob.type || 'image/jpeg',
        }),
      )
    } catch (error) {
      failures.push({ key, reason: failureReason(error) })
    }
  }

  return { files, failures }
}
