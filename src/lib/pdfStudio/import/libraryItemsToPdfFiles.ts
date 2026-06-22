import type { LibraryItem } from '../../../types/biblioteca'
import { libraryItemServeUrl } from '../../../api/biblioteca'

/**
 * Adaptador de "enviar a Imprenta" para la Biblioteca — análogo de
 * {@link recortesToPdfFiles}. Toma los items seleccionados, baja el blob de cada
 * uno por su URL de servir autenticada y los envuelve en `File`s que el pipeline
 * de importación de Imprenta (`usePdfStudioImport.addFiles`) sabe ingerir.
 *
 * Igual que `recortesToPdfFiles`, este módulo SOLO baja blobs y arma `File`s: NO
 * importa pdf-lib ni pdf.js (el ensamblado del PDF ocurre adentro del Imprenta
 * lazy). Así se mantiene fuera de la frontera lazy del runtime de PDF.
 */

type LibraryPdfImportFailure = {
  /** Id compuesto del item (`${kind}:${itemId}`), para diagnóstico. */
  id: string
  reason: string
}

export type LibraryItemsToPdfFilesResult = {
  files: File[]
  failures: LibraryPdfImportFailure[]
}

type LibraryItemsToPdfFilesOptions = {
  fetchBlob: (url: string) => Promise<Blob>
}

/**
 * ¿Imprenta puede ingerir este item? Su pipeline de importación
 * (`usePdfStudioImport`) acepta imágenes (`image/*`) y PDFs (`application/pdf`):
 * las imágenes se montan en hojas y los PDFs se anexan como páginas. Además el
 * item tiene que ser servible (tener URL de blob) — los dominios sin endpoint de
 * blob (pdf-studio-saved-pdfs, pdf-stamp-assets) no se pueden bajar y se excluyen.
 *
 * Puro y testeable: la barra de selección lo reusa para habilitar/deshabilitar
 * "Enviar a Imprenta" sin duplicar la regla.
 */
export function canSendLibraryItemToImprenta(item: LibraryItem): boolean {
  if (libraryItemServeUrl(item) === null) return false
  const mime = item.mimeType?.toLowerCase() ?? ''
  return (
    item.fileType === 'image' ||
    item.fileType === 'pdf' ||
    mime.startsWith('image/') ||
    mime === 'application/pdf'
  )
}

function failureReason(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo descargar'
}

/**
 * Baja los blobs de los items ingeribles y los envuelve como `File`s con el
 * título del item y su mime. Los items no ingeribles (Office, audio, video, o
 * sin URL de servir) se omiten silenciosamente; los que fallan al bajar quedan
 * en `failures` (mismo contrato que `recortesToPdfFiles`).
 */
export async function libraryItemsToPdfFiles(
  items: LibraryItem[],
  { fetchBlob }: LibraryItemsToPdfFilesOptions,
): Promise<LibraryItemsToPdfFilesResult> {
  const files: File[] = []
  const failures: LibraryPdfImportFailure[] = []

  for (const item of items) {
    const url = libraryItemServeUrl(item)
    if (!url || !canSendLibraryItemToImprenta(item)) continue
    try {
      const blob = await fetchBlob(url)
      files.push(new File([blob], item.title, { type: item.mimeType ?? '' }))
    } catch (error) {
      failures.push({ id: item.id, reason: failureReason(error) })
    }
  }

  return { files, failures }
}
