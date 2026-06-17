/** Borde browser-only del editor de PDF: ensambla el documento final con pdf-lib. */
import {
  getSource,
  isEmbeddableFont,
  standardFontName,
  type PdfDoc,
  type PdfFontKind,
  type PdfSource,
} from '../model/model'
import type { PDFFont, PDFPage } from 'pdf-lib'
import { applyPdfAnnotations } from './assembleAnnotations'
import { applyDocumentSettings } from './assembleDocumentSettings'
import { embeddableFontUrl, fetchFontBytes } from './assembleFonts'
import { addImageSheetPage, readPngSize, resolveImagesPerPage } from './assembleImages'
import { countImages, emitLifecycle } from './assembleProgress'
import {
  addRedactedRasterPage,
  annotationsWithoutRedactions,
  pageHasRedactions,
} from './assembleRedactions'
import { exportWarnings } from './assembleWarnings'
import {
  createProgressEmitter,
  errMessage,
  PdfExportPipelineError,
  throwIfAborted,
  type AssembleOptions,
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

export type AssembleResult = {
  blob: Blob
  skipped: SkippedSource[]
  warnings: PdfExportWarning[]
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
  const fontFor = async (
    font: PdfFontKind,
    bold: boolean,
    italic = false,
  ): Promise<PDFFont> => {
    const key = `${font}:${bold ? 'b' : 'r'}:${italic ? 'i' : 'n'}`
    const hit = fontCache.get(key)
    if (hit) return hit
    let embedded: PDFFont | null = null
    const url = italic ? null : embeddableFontUrl(font, bold)
    if (url) {
      try {
        embedded = await out.embedFont(await fetchFontBytes(url), { subset: true })
      } catch {
        embedded = null
      }
    }
    const resolved =
      embedded ?? (await out.embedFont(standardFontName(font, bold, italic)))
    fontCache.set(key, resolved)
    return resolved
  }

  emitLifecycle(emit, 'process-pages', 'start', 0, doc.pages.length)
  const imagesPerPage = resolveImagesPerPage(doc.settings)
  for (let pageIndex = 0; pageIndex < doc.pages.length; pageIndex += 1) {
    throwIfAborted(options.signal, 'process-pages')
    const page = doc.pages[pageIndex]!
    const source = getSource(doc, page.sourceId)
    if (!source || skippedIds.has(source.id)) continue
    try {
      let outPage: PDFPage | null = null
      const redacted = pageHasRedactions(page)
      if (redacted) {
        outPage = await addRedactedRasterPage({
          out,
          source,
          page,
          compression: options.compression,
        })
      } else if (page.kind === 'pdf') {
        const src = await loadPdf(source.file)
        const [copied] = await out.copyPages(src, [page.pageIndex])
        if (copied) outPage = out.addPage(copied)
      } else {
        const entries: Array<{ page: typeof page; source: PdfSource }> = []
        let scanIndex = pageIndex
        while (scanIndex < doc.pages.length && entries.length < imagesPerPage) {
          const candidate = doc.pages[scanIndex]
          if (!candidate || candidate.kind !== 'image' || pageHasRedactions(candidate))
            break
          const candidateSource = getSource(doc, candidate.sourceId)
          if (!candidateSource || skippedIds.has(candidateSource.id)) break
          entries.push({ page: candidate, source: candidateSource })
          scanIndex += 1
        }
        outPage = await addImageSheetPage({
          out,
          entries,
          imagesPerPage,
          compression: options.compression,
          onImageDrawn: async (sheetPage, entry, cell) => {
            if (entry.page.annotations.length === 0) return
            await applyPdfAnnotations({
              out,
              outPage: sheetPage,
              annotations: entry.page.annotations,
              fontFor,
              rgb,
              degrees,
              skipped,
              viewport: cell,
            })
          },
        })
        pageIndex = Math.max(pageIndex, scanIndex - 1)
      }
      if (!outPage) continue

      emitLifecycle(emit, 'apply-annotations', 'start', pageIndex + 1, doc.pages.length)
      const annotations = redacted
        ? annotationsWithoutRedactions(page.annotations)
        : page.kind === 'image'
          ? []
          : page.annotations
      if (annotations.length > 0) {
        await applyPdfAnnotations({
          out,
          outPage,
          annotations,
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
