/**
 * Borde BROWSER-ONLY del editor de PDF: ensambla el documento final con pdf-lib.
 *
 * pdf-lib se importa de forma PEREZOSA (sólo al guardar) para no engordar el
 * bundle principal. Usa canvas (re-encode de imágenes a JPEG) → browser-only, por
 * eso este archivo está EXCLUIDO del coverage y se mockea en los tests. El modelo
 * puro (`model.ts`) sí se testea.
 *
 * Recorre `doc.pages` EN ORDEN: para páginas de PDF copia la página original
 * (texto seleccionable intacto) con `copyPages`; para imágenes las re-encodea a
 * JPEG con fondo blanco y las embebe, una imagen por hoja a su tamaño. Un PDF
 * cifrado/corrupto o una imagen no decodificable se SALTEA (se reporta en
 * `skipped`) en vez de abortar todo.
 */
import { getSource, type PdfDoc, type PdfSource } from './model'

export type SkippedSource = { name: string; reason: string }
export type AssembleResult = { blob: Blob; skipped: SkippedSource[] }

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Re-encodea una imagen a JPEG (fondo blanco, dimensión acotada) → bytes. */
async function toJpegBytes(
  file: File,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const blobUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('No se pudo decodificar la imagen'))
      el.src = blobUrl
    })
    const MAX = 1600
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight))
    const width = Math.max(1, Math.round(img.naturalWidth * scale))
    const height = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible')
    // Fondo blanco: la transparencia no sale negra en el PDF.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    )
    if (!blob) throw new Error('No se pudo codificar la imagen')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    return { bytes, width, height }
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

/**
 * Ensambla `doc` en un único PDF. Devuelve el blob y la lista de sources que se
 * saltearon (cifrados/corruptos/no decodificables) para avisar al usuario.
 * Lanza si NINGUNA página se pudo procesar.
 */
export async function assemble(doc: PdfDoc): Promise<AssembleResult> {
  const { PDFDocument } = await import('pdf-lib')
  const out = await PDFDocument.create()

  // Cache del PDFDocument fuente por File (se carga una vez por source).
  const srcCache = new Map<File, ReturnType<typeof PDFDocument.load>>()
  const loadPdf = (file: File) => {
    let p = srcCache.get(file)
    if (!p) {
      p = (async () => {
        const bytes = new Uint8Array(await file.arrayBuffer())
        return PDFDocument.load(bytes, { ignoreEncryption: true })
      })()
      srcCache.set(file, p)
    }
    return p
  }

  const skipped: SkippedSource[] = []
  const skippedIds = new Set<string>()
  const recordSkip = (source: PdfSource, err: unknown) => {
    if (skippedIds.has(source.id)) return
    skippedIds.add(source.id)
    skipped.push({ name: source.file.name, reason: errMessage(err) })
  }

  for (const page of doc.pages) {
    const source = getSource(doc, page.sourceId)
    if (!source || skippedIds.has(source.id)) continue
    try {
      if (page.kind === 'pdf') {
        const src = await loadPdf(source.file)
        const [copied] = await out.copyPages(src, [page.pageIndex])
        if (copied) out.addPage(copied)
      } else {
        const { bytes, width, height } = await toJpegBytes(source.file)
        const jpg = await out.embedJpg(bytes)
        const p = out.addPage([width, height])
        p.drawImage(jpg, { x: 0, y: 0, width, height })
      }
    } catch (err) {
      // Saltea esta página y el resto del source (si el PDF está corrupto, no
      // sirve seguir intentando sus otras páginas).
      recordSkip(source, err)
    }
  }

  if (out.getPageCount() === 0) {
    throw new Error('No se pudo armar el PDF: ninguna página se pudo procesar.')
  }

  const bytes = await out.save()
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  return { blob, skipped }
}
