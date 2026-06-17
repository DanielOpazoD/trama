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
import { addImageGridPage, addImagePage, readPngSize } from './assembleImages'
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
      (a) => a.kind === 'text' && a.text.trim() && !a.italic && isEmbeddableFont(a.font),
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
  const fontFor = async (font: PdfFontKind, bold: boolean, italic = false): Promise<PDFFont> => {
    const key = `${font}:${bold ? 'b' : 'r'}:${italic ? 'i' : 'n'}`
    const hit = fontCache.get(key)
    if (hit) return hit
    let embedded: PDFFont | null = null
    const url = embeddableFontUrl(font, bold, italic)
    if (url) {
      try {
        embedded = await out.embedFont(await fetchFontBytes(url), { subset: true })
      } catch {
        embedded = null
      }
    }
    const resolved = embedded ?? (await out.embedFont(standardFontName(font, bold, italic)))
    fontCache.set(key, resolved)
    return resolved
  }

  emitLifecycle(emit, 'process-pages', 'start', 0, doc.pages.length)
  for (let pageIndex = 0; pageIndex < doc.pages.length; pageIndex += 1) {
    const page = doc.pages[pageIndex]!
    throwIfAborted(options.signal, 'process-pages')
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
        const perPage = doc.settings?.imageLayout?.imagesPerPage ?? 1
        if (
          perPage > 1 &&
          page.annotations.length === 0 &&
          !page.rotationQuarters
        ) {
          const files: File[] = [source.file]
          let consumed = 1
          for (let j = pageIndex + 1; j < doc.pages.length && files.length < perPage; j += 1) {
            const nextPage = doc.pages[j]!
            const nextSource = getSource(doc, nextPage.sourceId)
            if (
              nextPage.kind !== 'image' ||
              !nextSource ||
              nextSource.kind !== 'image' ||
              nextPage.annotations.length > 0 ||
              nextPage.rotationQuarters
            ) break
            files.push(nextSource.file)
            consumed += 1
          }
          outPage = await addImageGridPage(out, files, {
            compression: options.compression,
            imagesPerPage: perPage,
          })
          pageIndex += consumed - 1
        } else {
          outPage = await addImagePage(out, source.file, {
            compression: options.compression,
          })
        }
      }
      if (!outPage) continue

      emitLifecycle(emit, 'apply-annotations', 'start', pageIndex + 1, doc.pages.length)
      const annotations = redacted
        ? annotationsWithoutRedactions(page.annotations)
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
