import type { Entity, Quote } from '../../types'
import {
  buildChapters,
  colophonLines,
  wrapLines,
  type LibroChapter,
  type LibroOptions,
} from './libroModel'
import interRegularUrl from '../pdfStudio/fonts/inter-latin-400-normal.woff?url'
import spectralRegularUrl from '../pdfStudio/fonts/spectral-latin-400-normal.woff?url'
import spectralBoldUrl from '../pdfStudio/fonts/spectral-latin-700-normal.woff?url'
import caveatRegularUrl from '../pdfStudio/fonts/caveat-latin-400-normal.woff?url'

/**
 * Compone el florilegio como un PDF de imprenta en A5: portada, colofón,
 * un capítulo por entidad (citas en cronológico, fuente y marginalia),
 * folios, e índice onomástico con la página donde abre cada voz.
 *
 * pdf-lib + fontkit con las mismas WOFF vendoreadas del PDF Studio
 * (Spectral/Inter/Caveat, subset al exportar). Todo lazy: este módulo
 * solo se baja cuando el usuario pide su libro.
 */

// A5 en puntos PostScript (148 × 210 mm).
const PAGE_W = 419.53
const PAGE_H = 595.28
const MARGIN_X = 54
const MARGIN_TOP = 64
const MARGIN_BOTTOM = 60
const TEXT_W = PAGE_W - MARGIN_X * 2

// Tinta de la edición — el libro es SIEMPRE papel claro (es para imprimir).
const INK = { r: 0.094, g: 0.094, b: 0.106 } // #18181b
const INK_MUTED = { r: 0.32, g: 0.32, b: 0.36 }
const GOLD = { r: 0.627, g: 0.474, b: 0 } // #a07900

async function fetchFontBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No se pudo cargar la fuente (${res.status})`)
  return new Uint8Array(await res.arrayBuffer())
}

export type LibroProgress = (step: string) => void

export async function buildLibroPdf(
  entities: Entity[],
  quotes: Quote[],
  options: LibroOptions,
  onProgress?: LibroProgress,
): Promise<Uint8Array> {
  onProgress?.('cargando tipografías…')
  const { PDFDocument, rgb } = await import('pdf-lib')
  const fk = await import('@pdf-lib/fontkit')

  const doc = await PDFDocument.create()
  doc.registerFontkit((fk.default ?? fk) as Parameters<typeof doc.registerFontkit>[0])
  doc.setTitle(options.title)
  doc.setCreator('Trama')

  const [serif, serifBold, sans, hand] = await Promise.all([
    doc.embedFont(await fetchFontBytes(spectralRegularUrl), { subset: true }),
    doc.embedFont(await fetchFontBytes(spectralBoldUrl), { subset: true }),
    doc.embedFont(await fetchFontBytes(interRegularUrl), { subset: true }),
    doc.embedFont(await fetchFontBytes(caveatRegularUrl), { subset: true }),
  ])

  const ink = rgb(INK.r, INK.g, INK.b)
  const muted = rgb(INK_MUTED.r, INK_MUTED.g, INK_MUTED.b)
  const gold = rgb(GOLD.r, GOLD.g, GOLD.b)

  const chapters = buildChapters(entities, quotes, options.includeMarginalia)

  // ---------- portada ----------
  onProgress?.('componiendo la portada…')
  const cover = doc.addPage([PAGE_W, PAGE_H])
  const eyebrow = 'F L O R I L E G I O'
  cover.drawText(eyebrow, {
    x: (PAGE_W - sans.widthOfTextAtSize(eyebrow, 8)) / 2,
    y: PAGE_H - 170,
    size: 8,
    font: sans,
    color: gold,
  })
  const titleLines = wrapLines(
    (s) => serifBold.widthOfTextAtSize(s, 24),
    options.title,
    TEXT_W - 40,
  )
  titleLines.forEach((line, i) => {
    cover.drawText(line, {
      x: (PAGE_W - serifBold.widthOfTextAtSize(line, 24)) / 2,
      y: PAGE_H - 220 - i * 32,
      size: 24,
      font: serifBold,
      color: ink,
    })
  })
  const afterTitleY = PAGE_H - 220 - titleLines.length * 32 - 8
  cover.drawRectangle({
    x: PAGE_W / 2 - 18,
    y: afterTitleY,
    width: 36,
    height: 1.6,
    color: gold,
    opacity: 0.8,
  })
  if (options.author) {
    cover.drawText(options.author, {
      x: (PAGE_W - serif.widthOfTextAtSize(options.author, 11)) / 2,
      y: afterTitleY - 30,
      size: 11,
      font: serif,
      color: muted,
    })
  }

  // ---------- colofón ----------
  const colophon = doc.addPage([PAGE_W, PAGE_H])
  const lines = colophonLines(quotes)
  lines.forEach((line, i) => {
    if (!line) return
    colophon.drawText(line, {
      x: (PAGE_W - serif.widthOfTextAtSize(line, 8.5)) / 2,
      y: 120 - i * 13,
      size: 8.5,
      font: serif,
      color: muted,
    })
  })

  // ---------- capítulos ----------
  // Cursor de composición: página actual + altura disponible. El folio se
  // numera desde el primer capítulo (la portada y el colofón no cuentan).
  let page = doc.addPage([PAGE_W, PAGE_H])
  let folio = 1
  let y = PAGE_H - MARGIN_TOP
  const chapterStartPages = new Map<string, number>()

  const drawFolio = (p: typeof page, n: number) => {
    const s = String(n)
    p.drawText(s, {
      x: (PAGE_W - sans.widthOfTextAtSize(s, 7.5)) / 2,
      y: MARGIN_BOTTOM - 28,
      size: 7.5,
      font: sans,
      color: muted,
    })
  }
  drawFolio(page, folio)

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H])
    folio += 1
    drawFolio(page, folio)
    y = PAGE_H - MARGIN_TOP
  }
  const ensure = (height: number) => {
    if (y - height < MARGIN_BOTTOM) newPage()
  }

  const drawChapter = (chapter: LibroChapter, isFirst: boolean) => {
    // Cada capítulo abre en página nueva (salvo el primero, que ya la tiene).
    if (!isFirst) newPage()
    chapterStartPages.set(chapter.title, folio)

    const heading = chapter.title.toUpperCase().split('').join(' ')
    const headingLines = wrapLines((s) => sans.widthOfTextAtSize(s, 9), heading, TEXT_W)
    y -= 26
    for (const line of headingLines) {
      page.drawText(line, {
        x: (PAGE_W - sans.widthOfTextAtSize(line, 9)) / 2,
        y,
        size: 9,
        font: sans,
        color: ink,
      })
      y -= 14
    }
    if (chapter.subtitle) {
      page.drawText(chapter.subtitle, {
        x: (PAGE_W - serif.widthOfTextAtSize(chapter.subtitle, 8.5)) / 2,
        y,
        size: 8.5,
        font: serif,
        color: muted,
      })
      y -= 16
    }
    page.drawRectangle({
      x: PAGE_W / 2 - 14,
      y,
      width: 28,
      height: 1.2,
      color: gold,
      opacity: 0.8,
    })
    y -= 30

    for (const q of chapter.quotes) {
      const QUOTE_SIZE = 10.5
      const QUOTE_LEADING = 16
      const quoteLines = wrapLines(
        (s) => serif.widthOfTextAtSize(s, QUOTE_SIZE),
        `«${q.text}»`,
        TEXT_W,
      )
      const sourceLines = q.source
        ? wrapLines((s) => serif.widthOfTextAtSize(s, 8), q.source, TEXT_W - 20)
        : []
      const margLines = q.marginalia
        ? wrapLines((s) => hand.widthOfTextAtSize(s, 11), q.marginalia, TEXT_W - 30)
        : []
      const blockH =
        quoteLines.length * QUOTE_LEADING +
        sourceLines.length * 11 +
        (sourceLines.length ? 4 : 0) +
        margLines.length * 14 +
        (margLines.length ? 6 : 0) +
        20

      // Keep-together si el bloque entero cabe en una página fresca;
      // si es más largo que una página, fluye partido (sin viudas raras).
      if (blockH <= PAGE_H - MARGIN_TOP - MARGIN_BOTTOM) ensure(blockH)

      for (const line of quoteLines) {
        ensure(QUOTE_LEADING)
        page.drawText(line, {
          x: MARGIN_X,
          y,
          size: QUOTE_SIZE,
          font: serif,
          color: ink,
        })
        y -= QUOTE_LEADING
      }
      if (sourceLines.length) {
        y -= 4
        for (const line of sourceLines) {
          ensure(11)
          page.drawText(line, {
            x: MARGIN_X + 10,
            y,
            size: 8,
            font: serif,
            color: muted,
          })
          y -= 11
        }
      }
      if (margLines.length) {
        y -= 6
        for (const line of margLines) {
          ensure(14)
          page.drawText(line, {
            x: MARGIN_X + 10,
            y,
            size: 11,
            font: hand,
            color: muted,
          })
          y -= 14
        }
      }
      y -= 20
    }
  }

  onProgress?.('componiendo los capítulos…')
  chapters.forEach((chapter, i) => drawChapter(chapter, i === 0))

  // ---------- índice onomástico ----------
  onProgress?.('cerrando con el índice…')
  newPage()
  const indexTitle = 'Í N D I C E'
  y -= 26
  page.drawText(indexTitle, {
    x: (PAGE_W - sans.widthOfTextAtSize(indexTitle, 9)) / 2,
    y,
    size: 9,
    font: sans,
    color: ink,
  })
  y -= 34
  for (const chapter of chapters) {
    ensure(15)
    const pageNum = String(chapterStartPages.get(chapter.title) ?? '')
    page.drawText(chapter.title, {
      x: MARGIN_X,
      y,
      size: 9.5,
      font: serif,
      color: ink,
    })
    page.drawText(pageNum, {
      x: PAGE_W - MARGIN_X - sans.widthOfTextAtSize(pageNum, 9),
      y,
      size: 9,
      font: sans,
      color: muted,
    })
    y -= 15
  }

  return doc.save()
}
