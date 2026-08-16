/** Borde browser-only del editor de PDF: ensambla el documento final con pdf-lib. */
import { getSource, isEmbeddableFont, type PdfDoc, type PdfSource } from '../model/model'
import type { PDFPage } from 'pdf-lib'
import { applyPdfAnnotations } from './assembleAnnotations'
import { applyDocumentSettings } from './assembleDocumentSettings'
import { createPdfFontResolver } from './assembleFontResolver'
import { readPngSize, resolveImagesPerPage } from './assembleImages'
import { addImageSheetFromDoc } from './assembleImageSheets'
import { countImages, emitLifecycle } from './assembleProgress'
import { createPdfPageCopier } from './assemblePageCopy'
import { loadPdfFontkit, loadPdfLib } from '../pdfRuntime/pdfLibLoader'
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
  const lib = await loadPdfLib()
  const { PDFDocument, rgb, degrees } = lib
  const out = await PDFDocument.create()

  emitLifecycle(emit, 'load-fonts', 'start')
  const hasEmbeddedText = doc.pages.some((p) =>
    p.annotations.some(
      (a) => a.kind === 'text' && a.text.trim() && isEmbeddableFont(a.font),
    ),
  )
  if (hasEmbeddedText) {
    out.registerFontkit(await loadPdfFontkit())
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
  const notedIds = new Set<string>()
  /** Avisa al usuario de un source con problemas, una sola vez. */
  const noteSkip = (source: PdfSource, err: unknown) => {
    if (notedIds.has(source.id)) return
    notedIds.add(source.id)
    skipped.push({ name: source.file.name, reason: errMessage(err) })
  }
  /** Además, deja de intentar el source entero: no se pudo ni abrir. */
  const recordSkip = (source: PdfSource, err: unknown) => {
    skippedIds.add(source.id)
    noteSkip(source, err)
  }

  const fontFor = createPdfFontResolver(out)
  const pageCopier = createPdfPageCopier({ doc, lib, loadPdf, out })

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
        const copied = await pageCopier.copyPage(pageIndex, source)
        // Una hoja suelta ilegible no invalida a sus hermanas sanas: se avisa y
        // se sigue. Un source que no se pudo ni abrir sí corta el resto, porque
        // ese error lo propaga `copyPage` al catch de abajo.
        if (!copied) noteSkip(source, pageCopier.failureFor(pageIndex))
        else outPage = out.addPage(copied)
      } else {
        const sheet = await addImageSheetFromDoc({
          doc,
          pageIndex,
          out,
          imagesPerPage,
          compression: options.compression,
          fontFor,
          rgb,
          degrees,
          skipped,
          skippedIds,
        })
        outPage = sheet.outPage
        pageIndex = sheet.nextPageIndex
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
