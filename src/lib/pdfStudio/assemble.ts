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
  baselineDropEm,
  getSource,
  isEmbeddableFont,
  standardFontName,
  TEXT_LINE_HEIGHT,
  textBoxLayout,
  type PdfDoc,
  type PdfFontKind,
  type PdfSource,
  type TextAnnotation,
} from './model'
import type { PDFFont, PDFPage } from 'pdf-lib'

// WOFF subset-latino de las fuentes REALES de la app (Inter sans, Spectral serif),
// vendorizados en `./fonts`. Vite los emite como ASSETS aparte (estos imports son
// sólo la URL); se bajan por `fetch` recién al ensamblar y `@pdf-lib/fontkit` los
// embebe con subconjunto. Así el PDF usa la tipografía exacta del editor sin
// engordar el bundle ni depender de la red en runtime (mismo origen, offline-ok).
import interRegularUrl from './fonts/inter-latin-400-normal.woff?url'
import interBoldUrl from './fonts/inter-latin-700-normal.woff?url'
import spectralRegularUrl from './fonts/spectral-latin-400-normal.woff?url'
import spectralBoldUrl from './fonts/spectral-latin-700-normal.woff?url'

/** URL del WOFF embebible para una familia + negrita; `null` si usa estándar. */
function embeddableFontUrl(font: PdfFontKind, bold: boolean): string | null {
  if (font === 'sans') return bold ? interBoldUrl : interRegularUrl
  if (font === 'serif') return bold ? spectralBoldUrl : spectralRegularUrl
  return null
}

/**
 * Baja los bytes del WOFF (asset del mismo origen; el navegador lo cachea por
 * HTTP entre guardados). `fontFor` lo llama una vez por familia+peso y documento.
 */
async function fetchFontBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`no se pudo cargar la fuente (${r.status})`)
  return new Uint8Array(await r.arrayBuffer())
}

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

/**
 * Dimensiones de un PNG leídas del chunk IHDR (ancho/alto big-endian en los
 * bytes 16..23), SIN decodificar la imagen. `null` si no parece PNG. Sirve para
 * decidir si conviene embeberlo sin pérdida o downscalearlo (PNG enorme).
 */
export function readPngSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 24 || !isPngBytes(b)) return null
  const w = b[16]! * 0x1000000 + b[17]! * 0x10000 + b[18]! * 0x100 + b[19]!
  const h = b[20]! * 0x1000000 + b[21]! * 0x10000 + b[22]! * 0x100 + b[23]!
  return { w, h }
}

// Arriba de ~15 MP, embeber el PNG sin pérdida pesaría de más: se downscalea por
// el camino JPEG (toJpegBytes, máx 1600px). Los screenshots normales no llegan.
const MAX_PNG_PX = 15_000_000

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

  // Sólo si hay texto con fuente embebible: registrar fontkit (necesario para
  // `embedFont` con bytes) y cargarlo PEREZOSO para no sumarlo cuando no se usa.
  const hasEmbeddedText = doc.pages.some((p) =>
    p.annotations.some((a) => a.text.trim() && isEmbeddableFont(a.font)),
  )
  if (hasEmbeddedText) {
    const fk = await import('@pdf-lib/fontkit')
    out.registerFontkit(fk.default ?? fk)
  }

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

  // Texto vectorial: se dibuja con la tipografía REAL de la app (Inter/Spectral
  // embebidas con SUBCONJUNTO) cuando la familia es embebible; si esa fuente no
  // carga, cae a las ESTÁNDAR base-14 (render garantizado). `embedFont` cacheado por
  // documento (clave familia+negrita). La posición/tamaño llegan como ratios del
  // tamaño de página; la baseline se baja `baselineDropEm` (modelo de line-box, el
  // mismo que usa el preview) desde el tope del texto.
  const fontCache = new Map<string, PDFFont>()
  const fontFor = async (font: PdfFontKind, bold: boolean): Promise<PDFFont> => {
    const key = `${font}:${bold ? 'b' : 'r'}`
    const hit = fontCache.get(key)
    if (hit) return hit
    let embedded: PDFFont | null = null
    const url = embeddableFontUrl(font, bold)
    if (url) {
      try {
        embedded = await out.embedFont(await fetchFontBytes(url), { subset: true })
      } catch {
        embedded = null // WOFF no disponible/ilegible → estándar abajo
      }
    }
    const resolved = embedded ?? (await out.embedFont(standardFontName(font, bold)))
    fontCache.set(key, resolved)
    return resolved
  }
  const applyAnnotations = async (outPage: PDFPage, annotations: TextAnnotation[]) => {
    const w = outPage.getWidth()
    const h = outPage.getHeight()
    for (const ann of annotations) {
      if (!ann.text.trim()) continue
      try {
        const font = await fontFor(ann.font, ann.bold)
        const layout = textBoxLayout(ann, w, h)
        const size = Math.max(1, layout.size)
        const c = hexToRgb(ann.color)
        outPage.drawText(ann.text, {
          x: layout.x,
          y: layout.topY - baselineDropEm(ann.font) * size,
          size,
          font,
          color: rgb(c.r, c.g, c.b),
          lineHeight: size * TEXT_LINE_HEIGHT,
          opacity: ann.opacity ?? 1,
          // CSS rota horario (+); pdf-lib rota antihorario (+) → se niega.
          rotate: degrees(-(ann.rotation ?? 0)),
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
      // PNG normal → sin pérdida. PNG enorme → cae al camino JPEG (downscalea).
      const size = readPngSize(buf)
      if (!size || size.w * size.h <= MAX_PNG_PX) {
        try {
          const png = await out.embedPng(buf)
          const p = out.addPage([png.width, png.height])
          p.drawImage(png, { x: 0, y: 0, width: png.width, height: png.height })
          return p
        } catch {
          // PNG no soportado por pdf-lib → JPEG abajo.
        }
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
