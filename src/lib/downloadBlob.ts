/**
 * Dispara la descarga de un Blob como archivo (ancla temporal + object URL).
 * 100% browser-API (createObjectURL/anchor click): se verifica en el navegador,
 * por eso queda excluido del coverage. Fuente única reusada por `photoExport`
 * (PDF de fotos) y el editor de PDF (`pdfStudio`).
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
