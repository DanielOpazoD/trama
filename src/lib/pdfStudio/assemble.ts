/**
 * Borde BROWSER-ONLY del editor de PDF: ensambla el documento final con pdf-lib.
 *
 * Orquesta un pipeline explícito y perezoso: fuentes, validación de assets,
 * páginas, anotaciones, compresión y guardado. La lógica pesada vive en módulos
 * pequeños para mantener el exportador testeable y fácil de endurecer.
 */
import {
  getSource,
  isEmbeddableFont,
  standardFontName,
  type PdfDoc,
  type PdfFontKind,
  type PdfSource,
} from './model'
import type { PDFFont, PDFPage } from 'pdf-lib'
import { applyPdfAnnotations } from './assembleAnnotations'
import { addImagePage, readPngSize } from './assembleImages'
import { exportWarnings } from './assembleWarnings'
import {
  createProgressEmitter,
  errMessage,
  PdfExportPipelineError,
  throwIfAborted,
  type AssembleOptions,
  type PdfExportProgressEvent,
  type PdfExportWarning,
  type SkippedSource,
} from './assemblePipeline'

export { readPngSize }
export { PdfExportPipelineError } from './assemblePipeline'
export type {
  AssembleOptions,
  PdfExportErrorCode,
  PdfExportPhase,
  PdfExportProgressEvent,
  PdfExportProgressStatus,
  PdfExportWarning,
  PdfExportWarningCode,
  SkippedSource,
} from './assemblePipeline'

import interRegularUrl from './fonts/inter-latin-400-normal.woff?url'
import interBoldUrl from './fonts/inter-latin-700-normal.woff?url'
import spectralRegularUrl from './fonts/spectral-latin-400-normal.woff?url'
import spectralBoldUrl from './fonts/spectral-latin-700-normal.woff?url'

export type AssembleResult = {
  blob: Blob
  skipped: SkippedSource[]
  warnings: PdfExportWarning[]
}

function embeddableFontUrl(font: PdfFontKind, bold: boolean): string | null {
  if (font === 'sans') return bold ? interBoldUrl : interRegularUrl
  if (font === 'serif') return bold ? spectralBoldUrl : spectralRegularUrl
  return null
}

async function fetchFontBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`no se pudo cargar la fuente (${r.status})`)
  return new Uint8Array(await r.arrayBuffer())
}

function countImages(doc: PdfDoc): number {
  return (
    doc.sources.filter((source) => source.kind === 'image').length +
    doc.pages.reduce(
      (count, page) =>
        count +
        page.annotations.filter((annotation) => annotation.kind === 'image').length,
      0,
    )
  )
}

function emitLifecycle(
  emit: (event: PdfExportProgressEvent) => void,
  phase: PdfExportProgressEvent['phase'],
  status: PdfExportProgressEvent['status'],
  current?: number,
  total?: number,
) {
  emit({ phase, status, current, total })
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
  const emit = createProgressEmitter(options.onProgress)
  throwIfAborted(options.signal, 'load-fonts')
  const { PDFDocument, rgb, degrees } = await import('pdf-lib')
  const out = await PDFDocument.create()

  emitLifecycle(emit, 'load-fonts', 'start')
  const hasEmbeddedText = doc.pages.some((p) =>
    p.annotations.some(
      (a) => a.kind === 'text' && a.text.trim() && isEmbeddableFont(a.font),
    ),
  )
  if (hasEmbeddedText) {
    const fk = await import('@pdf-lib/fontkit')
    out.registerFontkit(fk.default ?? fk)
  }
  emitLifecycle(emit, 'load-fonts', 'complete')
  throwIfAborted(options.signal, 'validate-images')

  emitLifecycle(emit, 'validate-images', 'start')
  const imageCount = countImages(doc)
  const warnings = exportWarnings(doc, imageCount)
  emitLifecycle(emit, 'validate-images', 'complete', imageCount, imageCount)

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
        embedded = null
      }
    }
    const resolved = embedded ?? (await out.embedFont(standardFontName(font, bold)))
    fontCache.set(key, resolved)
    return resolved
  }

  emitLifecycle(emit, 'process-pages', 'start', 0, doc.pages.length)
  for (const [pageIndex, page] of doc.pages.entries()) {
    throwIfAborted(options.signal, 'process-pages')
    const source = getSource(doc, page.sourceId)
    if (!source || skippedIds.has(source.id)) continue
    try {
      let outPage: PDFPage | null = null
      if (page.kind === 'pdf') {
        const src = await loadPdf(source.file)
        const [copied] = await out.copyPages(src, [page.pageIndex])
        if (copied) outPage = out.addPage(copied)
      } else {
        outPage = await addImagePage(out, source.file, {
          compression: options.compression,
        })
      }
      if (!outPage) continue

      emitLifecycle(emit, 'apply-annotations', 'start', pageIndex + 1, doc.pages.length)
      if (page.annotations.length > 0) {
        await applyPdfAnnotations({
          out,
          outPage,
          annotations: page.annotations,
          fontFor,
          rgb,
          degrees,
          skipped,
        })
      }
      emitLifecycle(
        emit,
        'apply-annotations',
        'complete',
        pageIndex + 1,
        doc.pages.length,
      )

      if (page.rotationQuarters) {
        const base = outPage.getRotation().angle
        outPage.setRotation(degrees(base + page.rotationQuarters * 90))
      }
      emitLifecycle(emit, 'process-pages', 'progress', pageIndex + 1, doc.pages.length)
    } catch (err) {
      throwIfAborted(options.signal, 'process-pages')
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
  emitLifecycle(emit, 'process-pages', 'complete', out.getPageCount(), doc.pages.length)
  throwIfAborted(options.signal, 'compress')

  emitLifecycle(emit, 'compress', 'start')
  await applyDocumentSettings(out, rgb, degrees, doc)
  emitLifecycle(emit, 'compress', 'complete')
  throwIfAborted(options.signal, 'save')

  emitLifecycle(emit, 'save', 'start')
  let bytes: Uint8Array
  try {
    bytes = await out.save({
      useObjectStreams: options.compression !== 'compatibility',
    })
  } catch (err) {
    throwIfAborted(options.signal, 'save')
    throw new PdfExportPipelineError({
      phase: 'save',
      code: 'SAVE_FAILED',
      message: `No se pudo guardar el PDF ensamblado: ${errMessage(err)}`,
      cause: err,
    })
  }
  emitLifecycle(emit, 'save', 'complete')
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  return { blob, skipped, warnings }
}

async function applyDocumentSettings(
  out: Awaited<ReturnType<(typeof import('pdf-lib'))['PDFDocument']['create']>>,
  rgb: (typeof import('pdf-lib'))['rgb'],
  degrees: (typeof import('pdf-lib'))['degrees'],
  doc: PdfDoc,
) {
  const settings = doc.settings
  const wmText = settings?.watermark?.text?.trim()
  if (!settings?.pageNumbers && !wmText) return

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
      const x = pos === 'left' ? margin : pos === 'right' ? w - margin - tw : (w - tw) / 2
      p.drawText(label, { x, y: margin, size, font: helv, color: rgb(0.35, 0.35, 0.4) })
    }
    if (wmText) {
      const size = Math.min(w, h) * 0.13
      const tw = helv.widthOfTextAtSize(wmText, size)
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
