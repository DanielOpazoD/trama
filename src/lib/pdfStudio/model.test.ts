import { describe, it, expect } from 'vitest'
import {
  addImageSource,
  addPdfSource,
  canExport,
  deletePage,
  emptyDoc,
  getSource,
  makeAnnotation,
  movePage,
  movePageByDelta,
  pageHasText,
  pageThumbKey,
  previewFontFamily,
  replacePageWithImage,
  reseedIds,
  rotatePage,
  setPageAnnotations,
  standardFontName,
  textBoxLayout,
  type PdfDoc,
} from './model'

const pdf = (name = 'a.pdf') => new File(['%PDF'], name, { type: 'application/pdf' })
const img = (name = 'a.png') => new File(['x'], name, { type: 'image/png' })

describe('pdfStudio/model', () => {
  it('documento vacío', () => {
    const d = emptyDoc()
    expect(d.pages).toHaveLength(0)
    expect(canExport(d)).toBe(false)
  })

  it('addPdfSource agrega una página por página del PDF', () => {
    const d = addPdfSource(emptyDoc(), pdf(), 3)
    expect(d.sources).toHaveLength(1)
    expect(d.pages).toHaveLength(3)
    expect(d.pages.every((p) => p.kind === 'pdf')).toBe(true)
    expect(d.pages.map((p) => (p.kind === 'pdf' ? p.pageIndex : -1))).toEqual([0, 1, 2])
    expect(canExport(d)).toBe(true)
  })

  it('addPdfSource con 0 / negativo / no-entero es seguro', () => {
    expect(addPdfSource(emptyDoc(), pdf(), 0).pages).toHaveLength(0)
    expect(addPdfSource(emptyDoc(), pdf(), -2).pages).toHaveLength(0)
    expect(addPdfSource(emptyDoc(), pdf(), 2.9).pages).toHaveLength(2) // floor
  })

  it('addImageSource agrega una página de imagen', () => {
    const d = addImageSource(emptyDoc(), img())
    expect(d.sources).toHaveLength(1)
    expect(d.pages).toHaveLength(1)
    expect(d.pages[0]!.kind).toBe('image')
  })

  it('movePage reordena; ignora mismo índice o fuera de rango', () => {
    let d = addPdfSource(emptyDoc(), pdf(), 3) // p0,p1,p2
    const ids = d.pages.map((p) => p.id)
    d = movePage(d, 0, 2) // [p1,p2,p0]
    expect(d.pages.map((p) => p.id)).toEqual([ids[1], ids[2], ids[0]])
    expect(movePage(d, 1, 1)).toBe(d) // mismo índice → mismo objeto
    expect(movePage(d, 0, 9)).toBe(d) // fuera de rango → no-op
  })

  it('movePageByDelta mueve un paso', () => {
    let d = addPdfSource(emptyDoc(), pdf(), 3)
    const ids = d.pages.map((p) => p.id)
    d = movePageByDelta(d, 2, -1) // sube la última
    expect(d.pages.map((p) => p.id)).toEqual([ids[0], ids[2], ids[1]])
  })

  it('deletePage quita la página y descarta el source huérfano', () => {
    let d = addImageSource(addPdfSource(emptyDoc(), pdf(), 1), img()) // 1 pdf-page + 1 img
    expect(d.sources).toHaveLength(2)
    d = deletePage(d, 0) // borra la única página del PDF → su source queda huérfano
    expect(d.pages).toHaveLength(1)
    expect(d.sources).toHaveLength(1) // pruned
    expect(d.sources[0]!.kind).toBe('image')
    expect(deletePage(d, 5)).toBe(d) // fuera de rango → no-op
  })

  it('deletePage NO descarta el source si le quedan páginas', () => {
    let d = addPdfSource(emptyDoc(), pdf(), 3)
    d = deletePage(d, 0)
    expect(d.pages).toHaveLength(2)
    expect(d.sources).toHaveLength(1) // el PDF aún tiene páginas
  })

  it('replacePageWithImage cambia la página por una imagen y limpia huérfanos', () => {
    let d = addPdfSource(emptyDoc(), pdf(), 1) // 1 pdf-page, 1 source
    d = replacePageWithImage(d, 0, img('anotada.jpg'))
    expect(d.pages).toHaveLength(1)
    expect(d.pages[0]!.kind).toBe('image')
    expect(d.sources).toHaveLength(1) // el PDF original quedó huérfano → pruned
    expect(d.sources[0]!.kind).toBe('image')
    expect(replacePageWithImage(d, 9, img())).toBe(d) // fuera de rango → no-op
  })

  it('getSource y pageThumbKey', () => {
    const d = addPdfSource(emptyDoc(), pdf(), 2)
    const p0 = d.pages[0]!
    expect(getSource(d, p0.sourceId)?.kind).toBe('pdf')
    expect(getSource(d, 'nope')).toBeUndefined()
    expect(pageThumbKey(p0)).toMatch(/:0$/)
    const di = addImageSource(emptyDoc(), img())
    expect(pageThumbKey(di.pages[0]!)).toMatch(/:img$/)
  })
})

describe('pdfStudio/model · texto vectorial', () => {
  const baseAnn = {
    text: 'Hola',
    xRatio: 0.1,
    yRatio: 0.2,
    sizeRatio: 0.04,
    color: '#222222',
    font: 'sans' as const,
    bold: false,
  }

  it('las páginas nuevas arrancan sin anotaciones', () => {
    const d = addImageSource(addPdfSource(emptyDoc(), pdf(), 2), img())
    expect(d.pages.every((p) => p.annotations.length === 0)).toBe(true)
  })

  it('makeAnnotation asigna un id único y conserva los campos', () => {
    const a = makeAnnotation(baseAnn)
    const b = makeAnnotation(baseAnn)
    expect(a.id).toBeTruthy()
    expect(a.id).not.toBe(b.id)
    expect(a.text).toBe('Hola')
    expect(a.font).toBe('sans')
  })

  it('setPageAnnotations reemplaza, no muta, e ignora fuera de rango', () => {
    let d = addPdfSource(emptyDoc(), pdf(), 2)
    const ann = makeAnnotation(baseAnn)
    d = setPageAnnotations(d, 1, [ann])
    expect(d.pages[0]!.annotations).toHaveLength(0)
    expect(d.pages[1]!.annotations).toEqual([ann])
    expect(pageHasText(d.pages[1]!)).toBe(true)
    expect(pageHasText(d.pages[0]!)).toBe(false)
    expect(setPageAnnotations(d, 9, [ann])).toBe(d) // fuera de rango → mismo doc
  })

  it('setPageAnnotations no muta el doc original (inmutable)', () => {
    const d0 = addPdfSource(emptyDoc(), pdf(), 1)
    const d1 = setPageAnnotations(d0, 0, [makeAnnotation(baseAnn)])
    expect(d0.pages[0]!.annotations).toHaveLength(0)
    expect(d1.pages[0]!.annotations).toHaveLength(1)
  })

  it('standardFontName mapea familia + negrita a fuentes base-14', () => {
    expect(standardFontName('sans', false)).toBe('Helvetica')
    expect(standardFontName('sans', true)).toBe('Helvetica-Bold')
    expect(standardFontName('serif', false)).toBe('Times-Roman')
    expect(standardFontName('serif', true)).toBe('Times-Bold')
    expect(standardFontName('mono', false)).toBe('Courier')
    expect(standardFontName('mono', true)).toBe('Courier-Bold')
  })

  it('previewFontFamily da stacks web-safe por familia', () => {
    expect(previewFontFamily('sans')).toMatch(/Arial|Helvetica/)
    expect(previewFontFamily('serif')).toMatch(/Times/)
    expect(previewFontFamily('mono')).toMatch(/Courier|monospace/)
  })

  it('textBoxLayout convierte ratios a puntos (tope desde abajo)', () => {
    const ann = makeAnnotation({ ...baseAnn, xRatio: 0.25, yRatio: 0.5, sizeRatio: 0.1 })
    const l = textBoxLayout(ann, 400, 600)
    expect(l.x).toBe(100) // 0.25 * 400
    expect(l.size).toBeCloseTo(60) // 0.1 * 600
    expect(l.topY).toBeCloseTo(300) // 600 - 0.5*600
  })

  it('reseedIds continúa el contador para no colisionar tras restaurar', () => {
    const restored = {
      sources: [],
      pages: [
        {
          id: 'p900',
          kind: 'image',
          sourceId: 's900',
          rotationQuarters: 0,
          annotations: [{ ...baseAnn, id: 't950' }],
        },
      ],
    } as unknown as PdfDoc
    reseedIds(restored)
    const a = makeAnnotation(baseAnn)
    expect(Number.parseInt(a.id.replace(/\D+/g, ''), 10)).toBeGreaterThan(950)
  })
})

describe('pdfStudio/model · rotación', () => {
  it('las páginas nuevas arrancan sin rotación', () => {
    const d = addImageSource(addPdfSource(emptyDoc(), pdf(), 2), img())
    expect(d.pages.every((p) => p.rotationQuarters === 0)).toBe(true)
  })

  it('rotatePage suma cuartos mod 4 y normaliza negativos; ignora fuera de rango', () => {
    let d = addImageSource(emptyDoc(), img())
    d = rotatePage(d, 0, 1)
    expect(d.pages[0]!.rotationQuarters).toBe(1)
    d = rotatePage(d, 0, 3)
    expect(d.pages[0]!.rotationQuarters).toBe(0) // 1+3=4 → 0
    d = rotatePage(d, 0, -1)
    expect(d.pages[0]!.rotationQuarters).toBe(3) // -1 → 3
    expect(rotatePage(d, 9, 1)).toBe(d) // fuera de rango → mismo doc
  })

  it('rotatePage no muta el doc original', () => {
    const d0 = addImageSource(emptyDoc(), img())
    const d1 = rotatePage(d0, 0, 1)
    expect(d0.pages[0]!.rotationQuarters).toBe(0)
    expect(d1.pages[0]!.rotationQuarters).toBe(1)
  })
})
