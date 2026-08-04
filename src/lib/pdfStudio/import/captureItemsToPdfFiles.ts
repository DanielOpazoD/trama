import type { CaptureItem } from '../../../api/notasFeed'
import {
  notesToPdfFiles,
  type NotePdfImportFailure,
  type NotesToPdfFilesOptions,
} from './notesToPdfFiles'
import { recortesToPdfFiles, type RecortePdfImportFailure } from './recortesToPdfFiles'

/**
 * Adaptador de "enviar a Imprenta" para una selección MIXTA del feed de Notas
 * (notas y capturas juntas). Compone los adaptadores por tipo respetando el
 * ORDEN del feed: Imprenta agrupa imágenes consecutivas en hojas, así que el
 * PDF queda como se ve la selección en pantalla, no ordenado por tipo.
 *
 * Mismo contrato `{ files, failures }` sin abortar, y misma restricción que
 * sus hermanos: solo baja blobs y arma `File`s — nada de pdf-lib/pdf.js.
 */

export type CaptureItemsToPdfFilesResult = {
  files: File[]
  failures: Array<NotePdfImportFailure | RecortePdfImportFailure>
}

export async function captureItemsToPdfFiles(
  items: CaptureItem[],
  options: NotesToPdfFilesOptions,
): Promise<CaptureItemsToPdfFilesResult> {
  const files: File[] = []
  const failures: CaptureItemsToPdfFilesResult['failures'] = []

  for (const item of items) {
    const result =
      item.type === 'note'
        ? await notesToPdfFiles([item.note], options)
        : await recortesToPdfFiles([item.recorte], { fetchBlob: options.fetchBlob })
    files.push(...result.files)
    failures.push(...result.failures)
  }

  return { files, failures }
}
