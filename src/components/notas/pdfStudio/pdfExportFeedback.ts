function messageFrom(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function pdfExportProgressLabel(pageCount: number): string {
  const safeCount = Math.max(0, Math.floor(pageCount))
  return `Preparando ${safeCount} ${safeCount === 1 ? 'página' : 'páginas'}…`
}

export function describePdfExportError(err: unknown): string {
  const raw = messageFrom(err)
  const normalized = raw.toLowerCase()
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
