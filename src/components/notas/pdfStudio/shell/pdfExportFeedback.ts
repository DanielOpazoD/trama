import type { PdfExportProgressEvent } from '../../../../lib/pdfStudio/assemble/assemble'

function messageFrom(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function codeFrom(err: unknown): string {
  if (typeof err !== 'object' || err === null || !('code' in err)) return ''
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' ? code : ''
}

export function pdfExportProgressLabel(pageCount: number): string {
  const safeCount = Math.max(0, Math.floor(pageCount))
  return `Preparando ${safeCount} ${safeCount === 1 ? 'página' : 'páginas'}…`
}

export function pdfExportPipelineProgressLabel(event: PdfExportProgressEvent): string {
  const suffix =
    event.current != null && event.total != null ? ` ${event.current}/${event.total}` : ''
  if (event.phase === 'load-fonts') return 'Preparando fuentes…'
  if (event.phase === 'validate-images') return 'Revisando imágenes…'
  if (event.phase === 'process-pages') return `Procesando páginas${suffix}…`
  if (event.phase === 'apply-annotations') return `Aplicando edición${suffix}…`
  if (event.phase === 'compress') return 'Optimizando PDF…'
  return 'Guardando PDF…'
}

export function describePdfExportError(err: unknown): string {
  const raw = messageFrom(err)
  const code = codeFrom(err)
  const normalized = raw.toLowerCase()
  if (code === 'PDF_FORM_DUPLICATE_FIELD') {
    return `Hay casilleros con nombres duplicados. Renombra las variables repetidas antes de descargar el PDF rellenable. Detalle: ${raw}`
  }
  if (code === 'PDF_FORM_PAGE_NOT_FOUND') {
    return `Un casillero apunta a una página que ya no existe. Elimina o vuelve a crear ese casillero antes de exportar. Detalle: ${raw}`
  }
  if (code === 'PDF_FORM_SIGNATURE_IMAGE_INVALID') {
    return `No se pudo procesar la imagen de firma. Vuelve a cargarla como PNG o JPG antes de exportar. Detalle: ${raw}`
  }
  if (/cancel|abort/.test(normalized)) {
    return 'Exportación cancelada.'
  }
  if (/redacci|redaction|unsafe_redaction/.test(normalized)) {
    return `No se pudo aplicar la redacción segura. La página redactada debe rasterizarse para eliminar el contenido subyacente. Detalle: ${raw}`
  }
  if (/font|fontkit|fuente|woff/.test(normalized)) {
    return `No se pudo preparar una fuente del PDF. Intenta cambiar la familia de letra o exportar de nuevo. Detalle: ${raw}`
  }
  if (/canvas|image|imagen|jpeg|png|decode|decodificar/.test(normalized)) {
    return `No se pudo procesar una imagen del PDF. Si es muy grande, reduce su tamaño o vuelve a insertarla. Detalle: ${raw}`
  }
  if (
    /memory|memoria|allocation|array buffer|too large|grande|maximum/.test(normalized)
  ) {
    return `El PDF parece demasiado grande para la memoria disponible. Exporta menos páginas o reduce imágenes grandes. Detalle: ${raw}`
  }
  return raw || 'No se pudo preparar el PDF.'
}
