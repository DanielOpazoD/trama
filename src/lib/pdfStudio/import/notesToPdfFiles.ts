import type { Note } from '../../../api/notes'
import { notasAttachmentsApi } from '../../../api/notas-attachments'

/**
 * Adaptador de "enviar a Imprenta" para NOTAS — hermano de
 * {@link recortesToPdfFiles} y {@link libraryItemsToPdfFiles}, con el mismo
 * contrato `{ files, failures }` que no aborta por un fallo individual.
 *
 * A diferencia de los recortes (que traen sus imágenes en el propio objeto),
 * los anexos de una nota viven en una tabla aparte 1:N: hay que LISTARLOS por
 * `(ownerType='note', ownerId)` y filtrar a `image/*` — una nota también anexa
 * PDFs o audio, y esos no son páginas de Imprenta por esta vía.
 *
 * El ORDEN del array de salida importa: el import de Imprenta agrupa imágenes
 * consecutivas en hojas compartidas, así que se preserva el orden de las notas
 * recibidas y, dentro de cada nota, el orden en que el endpoint lista sus
 * anexos.
 *
 * Igual que sus hermanos, este módulo solo baja blobs y arma `File`s: NADA de
 * pdf-lib/pdf.js acá (la frontera lazy del runtime de PDF lo prohíbe y un gate
 * lo vigila). El ensamblado en hojas es de Imprenta.
 */

export type NotePdfImportFailure = {
  /** `${noteId}` o `${noteId}:${attachmentId}`, para diagnóstico. */
  id: string
  reason: string
}

export type NotesToPdfFilesResult = {
  files: File[]
  failures: NotePdfImportFailure[]
}

export type NotesToPdfFilesOptions = {
  fetchBlob: (url: string) => Promise<Blob>
  /** Inyectable en tests; por defecto, el api real de anexos. */
  listAttachments?: typeof notasAttachmentsApi.list
}

/** ¿La nota puede aportar páginas? El flag lo calcula el servidor con EXISTS,
 *  así que la UI puede decidir sin listar anexos. Predicado puro y compartido
 *  (tarjeta, barra de selección) para no duplicar la regla. */
export function canSendNoteToImprenta(note: Pick<Note, 'hasImages'>): boolean {
  return note.hasImages
}

function failureReason(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo descargar'
}

export async function notesToPdfFiles(
  notes: Note[],
  { fetchBlob, listAttachments = notasAttachmentsApi.list }: NotesToPdfFilesOptions,
): Promise<NotesToPdfFilesResult> {
  const files: File[] = []
  const failures: NotePdfImportFailure[] = []

  for (const note of notes) {
    let images: Awaited<ReturnType<typeof listAttachments>>
    try {
      const attachments = await listAttachments({ ownerType: 'note', ownerId: note.id })
      images = attachments.filter((a) => a.mimeType.startsWith('image/'))
    } catch (error) {
      failures.push({ id: note.id, reason: failureReason(error) })
      continue
    }
    for (const image of images) {
      try {
        const blob = await fetchBlob(image.url)
        files.push(
          new File([blob], image.fileName, {
            type: blob.type || image.mimeType || 'image/jpeg',
          }),
        )
      } catch (error) {
        failures.push({ id: `${note.id}:${image.id}`, reason: failureReason(error) })
      }
    }
  }

  return { files, failures }
}
