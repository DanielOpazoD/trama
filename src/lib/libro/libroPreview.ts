/**
 * Vista previa del libro: renderiza las primeras páginas del PDF recién
 * compuesto como imágenes, con el MISMO pdf.js lazy del PDF Studio. El
 * usuario hojea la edición antes de descargarla.
 */
export async function renderPdfPreviewPages(
  bytes: Uint8Array,
  maxPages = 4,
): Promise<string[]> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  // Copia defensiva: getDocument puede transferir el buffer al worker y
  // dejaría los bytes originales (los que se descargan) desprendidos.
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    disableWorker: true,
  } as unknown as Parameters<typeof pdfjs.getDocument>[0])
  const doc = await task.promise
  try {
    const out: string[] = []
    const total = Math.min(doc.numPages, maxPages)
    for (let i = 1; i <= total; i += 1) {
      const page = await doc.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: 480 / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D no disponible')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({
        canvas,
        canvasContext: ctx,
        viewport,
      } as unknown as Parameters<typeof page.render>[0]).promise
      out.push(canvas.toDataURL('image/png'))
    }
    return out
  } finally {
    try {
      await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.()
    } catch {
      /* el worker ya pudo haberse ido */
    }
  }
}
