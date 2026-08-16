/**
 * Copia de páginas PDF en UN solo `copyPages` por documento fuente.
 *
 * pdf-lib crea un `PDFObjectCopier` nuevo en cada llamada a `copyPages`, y ese
 * copier es lo único que deduplica lo ya copiado. Copiando página por página,
 * todo lo que las páginas comparten —fuentes embebidas, imágenes, el
 * `/Resources` heredado del árbol— se duplica una vez POR PÁGINA. Con un libro
 * grande el resultado crece 12–16× sobre lo que debería pesar.
 *
 * Acá se junta el pedido: la primera página de un source dispara la copia de
 * TODAS las páginas de ese source que van al PDF final, en una sola llamada.
 */
import type { PDFDocument, PDFPage } from 'pdf-lib'
import type { PdfDoc, PdfSource } from '../model/model'
import type { PdfLib } from '../pdfRuntime/pdfLibLoader'
import { prunePageResources } from './assemblePageResources'
import { pageHasRedactions } from './assembleRedactions'

type CopyRequest = { docPageIndex: number; sourcePageIndex: number }

export type PdfPageCopier = {
  /**
   * Página copiada lista para `addPage`, o `null` si esa página no se pidió.
   * Propaga el error del source (cifrado, corrupto) para que el llamador lo
   * registre como salteado, igual que cuando se copiaba de a una.
   */
  copyPage(docPageIndex: number, source: PdfSource): Promise<PDFPage | null>
}

export function createPdfPageCopier({
  doc,
  lib,
  loadPdf,
  out,
}: {
  doc: PdfDoc
  lib: PdfLib
  loadPdf: (file: File) => Promise<PDFDocument>
  out: PDFDocument
}): PdfPageCopier {
  const copies = new Map<number, PDFPage>()
  const failures = new Map<number, unknown>()
  const prepared = new Set<string>()

  /** Páginas del documento final que salen de este source por copia directa. */
  function requestsFor(source: PdfSource): CopyRequest[] {
    const requests: CopyRequest[] = []
    doc.pages.forEach((page, docPageIndex) => {
      if (page.sourceId !== source.id || page.kind !== 'pdf') return
      // Una página con redacciones se rasteriza aparte; no pasa por acá.
      if (pageHasRedactions(page)) return
      requests.push({ docPageIndex, sourcePageIndex: page.pageIndex })
    })
    return requests
  }

  async function prepare(source: PdfSource): Promise<void> {
    const src = await loadPdf(source.file)
    const requests = requestsFor(source)
    if (requests.length === 0) return
    // Podar ANTES de copiar: después ya no sirve, porque el copier registra en
    // el documento destino todo lo que alcanzó y `save` lo escribe igual.
    for (const sourcePageIndex of new Set(requests.map((r) => r.sourcePageIndex))) {
      prunePageResources(lib, src, sourcePageIndex)
    }
    const indices = requests.map((request) => request.sourcePageIndex)
    let copied: PDFPage[]
    try {
      copied = await out.copyPages(src, indices)
    } catch {
      // Una página ilegible no debe tumbar a sus hermanas sanas: se reintenta de
      // a una y sólo queda registrada la que falla.
      for (const request of requests) {
        try {
          const [page] = await out.copyPages(src, [request.sourcePageIndex])
          if (page) copies.set(request.docPageIndex, page)
        } catch (error) {
          failures.set(request.docPageIndex, error)
        }
      }
      return
    }
    requests.forEach((request, index) => {
      const page = copied[index]
      if (page) copies.set(request.docPageIndex, page)
    })
  }

  return {
    async copyPage(docPageIndex, source) {
      if (!prepared.has(source.id)) {
        prepared.add(source.id)
        await prepare(source)
      }
      if (failures.has(docPageIndex)) throw failures.get(docPageIndex)
      return copies.get(docPageIndex) ?? null
    },
  }
}
