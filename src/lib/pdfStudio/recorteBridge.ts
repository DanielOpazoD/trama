/**
 * Canal efímero Recortes → Imprenta.
 *
 * Los `File` no se pueden serializar en URL/localStorage sin duplicar blobs o
 * exponerlos; por eso mantenemos una cola en memoria durante la sesión y
 * avisamos a NotasWorld para que navegue a Imprenta. PdfStudio drena la cola al
 * montar. Si el usuario recarga la página, simplemente vuelve a enviar el recorte.
 */
export const PDF_STUDIO_RECORTE_EVENT = 'trama:pdf-studio-recortes'

const queuedFiles: File[] = []

export function enqueuePdfStudioRecorteFiles(files: File[]): void {
  if (files.length === 0) return
  queuedFiles.push(...files)
  window.dispatchEvent(
    new CustomEvent(PDF_STUDIO_RECORTE_EVENT, { detail: { count: files.length } }),
  )
}

export function takePdfStudioRecorteFiles(): File[] {
  return queuedFiles.splice(0)
}
