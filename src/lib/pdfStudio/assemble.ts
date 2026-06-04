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
import {
  getSource,
  standardFontName,
  textBoxLayout,
  type PdfDoc,
  type PdfSource,
  type TextAnnotation,
} from './model'
import type { PDFFont, PDFPage } from 'pdf-lib'

export type SkippedSource = { name: string; reason: string }
export type AssembleResult = { blob: Blob; skipped: SkippedSource[] }

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** `#rrggbb` → componentes 0..1 (negro si no parsea). */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return { r: 0, g: 0, b: 0 }
  const n = parseInt(m[1]!, 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}

/** Firma de archivo PNG (‰PNG) — para embeber sin pérdida aunque falte el mime. */
function isPngBytes(b: Uint8Array): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
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
  const { PDFDocument, rgb, degrees } = await import('pdf-lib')
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

  // Texto vectorial (PR D): se dibuja sobre la página con fuentes ESTÁNDAR de PDF
  // (base-14, sin embeber → render garantizado en cualquier visor). `embedFont`
  // por nombre, cacheado por documento. La posición/tamaño llegan como ratios del
  // tamaño de página; `yRatio` es el tope desde arriba y pdf-lib usa la baseline
  // desde abajo, así que se resta el ascent de la fuente.
  const fontCache = new Map<string, PDFFont>()
  const applyAnnotations = async (outPage: PDFPage, annotations: TextAnnotation[]) => {
    const w = outPage.getWidth()
    const h = outPage.getHeight()
    for (const ann of annotations) {
      if (!ann.text.trim()) continue
      try {
        const name = standardFontName(ann.font, ann.bold)
        let font = fontCache.get(name)
        if (!font) {
          font = await out.embedFont(name)
          fontCache.set(name, font)
        }
        const layout = textBoxLayout(ann, w, h)
        const size = Math.max(1, layout.size)
        const ascent = font.heightAtSize(size, { descender: false })
        const c = hexToRgb(ann.color)
        outPage.drawText(ann.text, {
          x: layout.x,
          y: layout.topY - ascent,
          size,
          font,
          color: rgb(c.r, c.g, c.b),
          lineHeight: size * 1.15,
        })
      } catch (err) {
        // p. ej. carácter fuera de WinAnsi en una fuente estándar.
        skipped.push({
          name: `texto «${ann.text.trim().slice(0, 16)}»`,
          reason: errMessage(err),
        })
      }
    }
  }

  // Embebe una imagen como una hoja. PNG → sin pérdida (`embedPng`, preserva
  // screenshots/line-art); el resto se re-encodea a JPEG. Si pdf-lib no soporta
  // ese PNG, cae al camino JPEG.
  const addImagePage = async (file: File): Promise<PDFPage> => {
    const buf = new Uint8Array(await file.arrayBuffer())
    if (file.type === 'image/png' || isPngBytes(buf)) {
      try {
        const png = await out.embedPng(buf)
        const p = out.addPage([png.width, png.height])
        p.drawImage(png, { x: 0, y: 0, width: png.width, height: png.height })
        return p
      } catch {
        // PNG no soportado → JPEG abajo.
      }
    }
    const { bytes, width, height } = await toJpegBytes(file)
    const jpg = await out.embedJpg(bytes)
    const p = out.addPage([width, height])
    p.drawImage(jpg, { x: 0, y: 0, width, height })
    return p
  }

  for (const page of doc.pages) {
    const source = getSource(doc, page.sourceId)
    if (!source || skippedIds.has(source.id)) continue
    try {
      let outPage: PDFPage | null = null
      if (page.kind === 'pdf') {
        const src = await loadPdf(source.file)
        const [copied] = await out.copyPages(src, [page.pageIndex])
        if (copied) outPage = out.addPage(copied)
      } else {
        outPage = await addImagePage(source.file)
      }
      if (outPage) {
        // Texto en coords nativas; la rotación de página lo rota junto con todo.
        if (page.annotations.length > 0) await applyAnnotations(outPage, page.annotations)
        if (page.rotationQuarters) {
          const base = outPage.getRotation().angle
          outPage.setRotation(degrees(base + page.rotationQuarters * 90))
        }
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
