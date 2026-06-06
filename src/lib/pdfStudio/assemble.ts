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
  type Annotation,
  type PdfDoc,
  type PdfFontKind,
  type PdfSource,
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
export type PdfExportPhase =
  | 'load-fonts'
  | 'validate-images'
  | 'process-pages'
  | 'apply-annotations'
  | 'compress'
  | 'save'
export type PdfExportProgressStatus = 'start' | 'progress' | 'complete'
export type PdfExportProgressEvent = {
  phase: PdfExportPhase
  status: PdfExportProgressStatus
  current?: number
  total?: number
  message?: string
}
export type AssembleOptions = {
  onProgress?: (event: PdfExportProgressEvent) => void
}
export type PdfExportErrorCode =
  | 'NO_PAGES_EXPORTED'
  | 'FONT_LOAD_FAILED'
  | 'IMAGE_PROCESSING_FAILED'
  | 'PDF_PROCESSING_FAILED'
  | 'SAVE_FAILED'

export class PdfExportPipelineError extends Error {
  readonly name = 'PdfExportPipelineError'
  readonly phase: PdfExportPhase
  readonly code: PdfExportErrorCode
  readonly cause?: unknown

  constructor({
    phase,
    code,
    message,
    cause,
  }: {
    phase: PdfExportPhase
    code: PdfExportErrorCode
    message: string
    cause?: unknown
  }) {
    super(message)
    this.phase = phase
    this.code = code
    this.cause = cause
  }
}

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

function fitTextForPdfBox({
  text,
  font,
  size,
  maxWidth,
  maxHeight,
  lineHeight,
}: {
  text: string
  font: PDFFont
  size: number
  maxWidth?: number
  maxHeight?: number
  lineHeight: number
}): string {
  const maxLines =
    maxHeight != null ? Math.max(1, Math.floor(maxHeight / lineHeight)) : Infinity
  const lines: string[] = []
  const push = (line: string) => {
    if (lines.length < maxLines) lines.push(line)
  }

  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (lines.length >= maxLines) break
    if (maxWidth == null) {
      push(paragraph)
      continue
    }

    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      push('')
      continue
    }

    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate
      } else {
        push(line)
        line = word
        if (lines.length >= maxLines) break
      }
    }
    if (line && lines.length < maxLines) push(line)
  }

  return lines.join('\n')
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

/** Decodifica un data URL `data:...;base64,...` a bytes. `null` si no es base64. */
function dataUrlToBytes(src: string): Uint8Array | null {
  const i = src.indexOf('base64,')
  if (i < 0) return null
  const bin = atob(src.slice(i + 7))
  const out = new Uint8Array(bin.length)
  for (let j = 0; j < bin.length; j++) out[j] = bin.charCodeAt(j)
  return out
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
export async function assemble(
  doc: PdfDoc,
  options: AssembleOptions = {},
): Promise<AssembleResult> {
  const emit = (event: PdfExportProgressEvent) => options.onProgress?.(event)
  const { PDFDocument, rgb, degrees } = await import('pdf-lib')
  const out = await PDFDocument.create()

  // Sólo si hay texto con fuente embebible: registrar fontkit (necesario para
  // `embedFont` con bytes) y cargarlo PEREZOSO para no sumarlo cuando no se usa.
  const hasEmbeddedText = doc.pages.some((p) =>
    p.annotations.some(
      (a) => a.kind === 'text' && a.text.trim() && isEmbeddableFont(a.font),
    ),
  )
  emit({ phase: 'load-fonts', status: 'start' })
  if (hasEmbeddedText) {
    const fk = await import('@pdf-lib/fontkit')
    out.registerFontkit(fk.default ?? fk)
  }
  emit({ phase: 'load-fonts', status: 'complete' })

  emit({ phase: 'validate-images', status: 'start' })
  const imageCount =
    doc.sources.filter((source) => source.kind === 'image').length +
    doc.pages.reduce(
      (count, page) =>
        count +
        page.annotations.filter((annotation) => annotation.kind === 'image').length,
      0,
    )
  emit({
    phase: 'validate-images',
    status: 'complete',
    current: imageCount,
    total: imageCount,
  })

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
  // Dibuja cada anotación según su `kind`. Texto → `drawText` con la tipografía
  // real (o estándar de fallback); resaltado → `drawRectangle` translúcido. Cada
  // tipo nuevo del "estudio de marcado" agrega su caso acá.
  const applyAnnotations = async (outPage: PDFPage, annotations: Annotation[]) => {
    const w = outPage.getWidth()
    const h = outPage.getHeight()
    for (const ann of annotations) {
      try {
        if (ann.kind === 'text') {
          if (!ann.text.trim()) continue
          const font = await fontFor(ann.font, ann.bold)
          const layout = textBoxLayout(ann, w, h)
          const size = Math.max(1, layout.size)
          const c = hexToRgb(ann.color)
          const lineHeight = size * TEXT_LINE_HEIGHT
          const text = fitTextForPdfBox({
            text: ann.text,
            font,
            size,
            maxWidth: layout.maxWidth,
            maxHeight: layout.maxHeight,
            lineHeight,
          })
          if (!text.trim()) continue
          outPage.drawText(text, {
            x: layout.x,
            y: layout.topY - baselineDropEm(ann.font) * size,
            size,
            font,
            color: rgb(c.r, c.g, c.b),
            lineHeight,
            opacity: ann.opacity ?? 1,
            ...(layout.maxWidth != null ? { maxWidth: layout.maxWidth } : null),
            // CSS rota horario (+); pdf-lib rota antihorario (+) → se niega.
            rotate: degrees(-(ann.rotation ?? 0)),
          })
        } else if (ann.kind === 'highlight') {
          const c = hexToRgb(ann.color)
          // `yRatio` es el tope desde arriba; pdf-lib mide `y` desde abajo.
          outPage.drawRectangle({
            x: ann.xRatio * w,
            y: h - (ann.yRatio + ann.hRatio) * h,
            width: ann.wRatio * w,
            height: ann.hRatio * h,
            color: rgb(c.r, c.g, c.b),
            opacity: ann.opacity ?? 0.4,
          })
        } else if (ann.kind === 'shape') {
          const c = hexToRgb(ann.color)
          const col = rgb(c.r, c.g, c.b)
          const sw = Math.max(0.5, ann.strokeRatio * h)
          const op = ann.opacity ?? 1
          // Dos puntos en coords de pdf-lib (y desde abajo).
          const p0 = { x: ann.x0Ratio * w, y: h - ann.y0Ratio * h }
          const p1 = { x: ann.x1Ratio * w, y: h - ann.y1Ratio * h }
          if (ann.shape === 'rect' || ann.shape === 'oval') {
            const x = Math.min(p0.x, p1.x)
            const y = Math.min(p0.y, p1.y)
            const rw = Math.abs(p1.x - p0.x)
            const rh = Math.abs(p1.y - p0.y)
            // Sólo contorno: `opacity: 0` mata el relleno, `borderOpacity` lo muestra.
            if (ann.shape === 'rect') {
              outPage.drawRectangle({
                x,
                y,
                width: rw,
                height: rh,
                borderColor: col,
                borderWidth: sw,
                opacity: 0,
                borderOpacity: op,
              })
            } else {
              outPage.drawEllipse({
                x: x + rw / 2,
                y: y + rh / 2,
                xScale: rw / 2,
                yScale: rh / 2,
                borderColor: col,
                borderWidth: sw,
                opacity: 0,
                borderOpacity: op,
              })
            }
          } else {
            outPage.drawLine({
              start: p0,
              end: p1,
              thickness: sw,
              color: col,
              opacity: op,
            })
            if (ann.shape === 'arrow') {
              const dx = p1.x - p0.x
              const dy = p1.y - p0.y
              const len = Math.hypot(dx, dy) || 1
              const back = { x: -dx / len, y: -dy / len } // de la punta hacia el inicio
              const headLen = Math.min(len * 0.3, Math.max(8, sw * 5))
              const a = Math.PI / 7 // ~25°
              const rot = (v: { x: number; y: number }, t: number) => ({
                x: v.x * Math.cos(t) - v.y * Math.sin(t),
                y: v.x * Math.sin(t) + v.y * Math.cos(t),
              })
              for (const t of [a, -a]) {
                const d = rot(back, t)
                outPage.drawLine({
                  start: p1,
                  end: { x: p1.x + d.x * headLen, y: p1.y + d.y * headLen },
                  thickness: sw,
                  color: col,
                  opacity: op,
                })
              }
            }
          }
        } else if (ann.kind === 'image') {
          const bytes = dataUrlToBytes(ann.src)
          if (!bytes) continue
          // Firma/sello: PNG (preserva transparencia) o JPEG según los magic bytes.
          const img = isPngBytes(bytes)
            ? await out.embedPng(bytes)
            : await out.embedJpg(bytes)
          // `yRatio` es el tope desde arriba; pdf-lib mide `y` desde abajo.
          outPage.drawImage(img, {
            x: ann.xRatio * w,
            y: h - (ann.yRatio + ann.hRatio) * h,
            width: ann.wRatio * w,
            height: ann.hRatio * h,
            opacity: ann.opacity ?? 1,
          })
        }
      } catch (err) {
        // p. ej. carácter fuera de WinAnsi en una fuente estándar.
        skipped.push({ name: `anotación ${ann.kind}`, reason: errMessage(err) })
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

  emit({ phase: 'process-pages', status: 'start', current: 0, total: doc.pages.length })
  for (const [pageIndex, page] of doc.pages.entries()) {
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
        emit({
          phase: 'apply-annotations',
          status: 'start',
          current: pageIndex + 1,
          total: doc.pages.length,
        })
        if (page.annotations.length > 0) await applyAnnotations(outPage, page.annotations)
        emit({
          phase: 'apply-annotations',
          status: 'complete',
          current: pageIndex + 1,
          total: doc.pages.length,
        })
        if (page.rotationQuarters) {
          const base = outPage.getRotation().angle
          outPage.setRotation(degrees(base + page.rotationQuarters * 90))
        }
        emit({
          phase: 'process-pages',
          status: 'progress',
          current: pageIndex + 1,
          total: doc.pages.length,
        })
      }
    } catch (err) {
      // Saltea esta página y el resto del source (si el PDF está corrupto, no
      // sirve seguir intentando sus otras páginas).
      recordSkip(source, err)
    }
  }

  if (out.getPageCount() === 0) {
    throw new PdfExportPipelineError({
      phase: 'process-pages',
      code: 'NO_PAGES_EXPORTED',
      message: 'No se pudo armar el PDF: ninguna página se pudo procesar.',
    })
  }
  emit({
    phase: 'process-pages',
    status: 'complete',
    current: out.getPageCount(),
    total: doc.pages.length,
  })

  // Ajustes a NIVEL DOCUMENTO: numeración en el pie + marca de agua diagonal sobre
  // TODAS las páginas de salida. Usan Helvetica estándar (no requiere fontkit). Se
  // dibujan en el espacio SIN rotar (una página rotada los llevaría rotados, caso
  // raro y aceptable para v1).
  const settings = doc.settings
  const wmText = settings?.watermark?.text?.trim()
  if (settings?.pageNumbers || wmText) {
    const outPages = out.getPages()
    const helv = await out.embedFont('Helvetica')
    const total = outPages.length
    outPages.forEach((p, i) => {
      const w = p.getWidth()
      const h = p.getHeight()
      if (settings?.pageNumbers) {
        const label = `${i + 1} / ${total}`
        const size = Math.max(8, Math.min(w, h) * 0.018)
        const tw = helv.widthOfTextAtSize(label, size)
        const margin = Math.max(18, Math.min(w, h) * 0.04)
        const pos = settings.pageNumbers.position
        const x =
          pos === 'left' ? margin : pos === 'right' ? w - margin - tw : (w - tw) / 2
        p.drawText(label, { x, y: margin, size, font: helv, color: rgb(0.35, 0.35, 0.4) })
      }
      if (wmText) {
        const size = Math.min(w, h) * 0.13
        const tw = helv.widthOfTextAtSize(wmText, size)
        // Centrado aprox. de un texto rotado 45° (CCW) respecto de su inicio.
        const d = (tw / 2) * Math.SQRT1_2
        p.drawText(wmText, {
          x: w / 2 - d,
          y: h / 2 - d,
          size,
          font: helv,
          color: rgb(0.6, 0.6, 0.62),
          opacity: 0.12,
          rotate: degrees(45),
        })
      }
    })
  }

  emit({ phase: 'compress', status: 'start' })
  emit({ phase: 'compress', status: 'complete' })
  emit({ phase: 'save', status: 'start' })
  let bytes: Uint8Array
  try {
    bytes = await out.save()
  } catch (err) {
    throw new PdfExportPipelineError({
      phase: 'save',
      code: 'SAVE_FAILED',
      message: `No se pudo guardar el PDF ensamblado: ${errMessage(err)}`,
      cause: err,
    })
  }
  emit({ phase: 'save', status: 'complete' })
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  return { blob, skipped }
}
