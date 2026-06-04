import { describe, it, expect } from 'vitest'
import {
  addImageSource,
  addPdfSource,
  baselineDropEm,
  canExport,
  deletePage,
  deletePages,
  duplicatePages,
  emptyDoc,
  getSource,
  isEmbeddableFont,
  isTextAnnotation,
  makeHighlightAnnotation,
  makeTextAnnotation,
  movePage,
  movePageByDelta,
  normalizeDoc,
  pageHasAnnotations,
  pageThumbKey,
  previewFontFamily,
  replacePageWithImage,
  reseedIds,
  rotatePage,
  rotatePages,
  setPageAnnotations,
  standardFontName,
  subsetDoc,
  textBoxLayout,
  type Annotation,
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

  it('makeTextAnnotation asigna un id único y conserva los campos', () => {
    const a = makeTextAnnotation(baseAnn)
    const b = makeTextAnnotation(baseAnn)
    expect(a.id).toBeTruthy()
    expect(a.id).not.toBe(b.id)
    expect(a.text).toBe('Hola')
    expect(a.font).toBe('sans')
  })

  it('setPageAnnotations reemplaza, no muta, e ignora fuera de rango', () => {
    let d = addPdfSource(emptyDoc(), pdf(), 2)
    const ann = makeTextAnnotation(baseAnn)
    d = setPageAnnotations(d, 1, [ann])
    expect(d.pages[0]!.annotations).toHaveLength(0)
    expect(d.pages[1]!.annotations).toEqual([ann])
    expect(pageHasAnnotations(d.pages[1]!)).toBe(true)
    expect(pageHasAnnotations(d.pages[0]!)).toBe(false)
    expect(setPageAnnotations(d, 9, [ann])).toBe(d) // fuera de rango → mismo doc
  })

  it('setPageAnnotations no muta el doc original (inmutable)', () => {
    const d0 = addPdfSource(emptyDoc(), pdf(), 1)
    const d1 = setPageAnnotations(d0, 0, [makeTextAnnotation(baseAnn)])
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

  it('previewFontFamily usa la fuente REAL embebible (Inter/Spectral), Courier para mono', () => {
    expect(previewFontFamily('sans')).toMatch(/Inter/)
    expect(previewFontFamily('serif')).toMatch(/Spectral/)
    expect(previewFontFamily('mono')).toMatch(/Courier|monospace/)
  })

  it('isEmbeddableFont: sans y serif se embeben; mono no', () => {
    expect(isEmbeddableFont('sans')).toBe(true)
    expect(isEmbeddableFont('serif')).toBe(true)
    expect(isEmbeddableFont('mono')).toBe(false)
  })

  it('baselineDropEm modela el line-box (lh/2 + (ascent−descent)/2) por familia', () => {
    // Inter: ascent 2728/2816, descent 680/2816 → 0.575 + (2728−680)/2816/2
    expect(baselineDropEm('sans')).toBeCloseTo(0.575 + (2728 - 680) / 2816 / 2, 5)
    // Spectral: ascent 1.059, descent 0.463
    expect(baselineDropEm('serif')).toBeCloseTo(0.575 + (1.059 - 0.463) / 2, 5)
    // Courier (estándar): ascent 0.629, descent 0.157
    expect(baselineDropEm('mono')).toBeCloseTo(0.575 + (0.629 - 0.157) / 2, 5)
    // todas caen dentro de la caja (0..1·tamaño) y serif > sans > mono no garantizado,
    // pero todas deben ser fracciones razonables (~0.8..0.95)
    expect(baselineDropEm('sans')).toBeGreaterThan(0.5)
    expect(baselineDropEm('serif')).toBeLessThan(1)
  })

  it('textBoxLayout convierte ratios a puntos (tope desde abajo)', () => {
    const ann = makeTextAnnotation({
      ...baseAnn,
      xRatio: 0.25,
      yRatio: 0.5,
      sizeRatio: 0.1,
    })
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
    const a = makeTextAnnotation(baseAnn)
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

describe('pdfStudio/model · operaciones en lote (selección múltiple)', () => {
  const textAnn = () =>
    makeTextAnnotation({
      text: 'firma',
      xRatio: 0.1,
      yRatio: 0.1,
      sizeRatio: 0.05,
      color: '#222222',
      font: 'sans',
      bold: false,
    })

  it('deletePages quita varias, descarta huérfanos; no-op sin índices o fuera de rango', () => {
    let d = addPdfSource(emptyDoc(), pdf(), 3) // p0,p1,p2 (un source)
    d = addImageSource(d, img()) // p3 (otro source)
    const out = deletePages(d, [0, 2])
    expect(out.pages.length).toBe(2) // quedan p1 (pdf) y p3 (img)
    expect(out.sources.length).toBe(2) // ambos sources siguen en uso
    expect(deletePages(d, [])).toBe(d) // sin índices → mismo doc
    expect(deletePages(d, [99])).toBe(d) // fuera de rango → mismo doc
  })

  it('deletePages que vacía un source lo descarta', () => {
    let d = addPdfSource(emptyDoc(), pdf(), 2)
    d = addImageSource(d, img())
    const out = deletePages(d, [0, 1]) // borra ambas páginas del PDF
    expect(out.pages.length).toBe(1)
    expect(out.sources.length).toBe(1)
    expect(out.sources[0]!.kind).toBe('image')
  })

  it('rotatePages rota varias; no-op fuera de rango o sin índices (mismo doc)', () => {
    let d = addPdfSource(emptyDoc(), pdf(), 3)
    d = rotatePages(d, [0, 2], 1)
    expect(d.pages.map((p) => p.rotationQuarters)).toEqual([1, 0, 1])
    expect(rotatePages(d, [99], 1)).toBe(d)
    expect(rotatePages(d, [], 1)).toBe(d)
  })

  it('duplicatePages inserta la copia justo después, misma fuente, anotaciones con id nuevo', () => {
    let d = addImageSource(emptyDoc(), img())
    const ann = textAnn()
    d = setPageAnnotations(d, 0, [ann])
    const out = duplicatePages(d, [0])
    expect(out.pages.length).toBe(2)
    expect(out.pages[1]!.id).not.toBe(out.pages[0]!.id)
    expect(out.pages[1]!.sourceId).toBe(out.pages[0]!.sourceId) // no re-importa
    expect(out.pages[1]!.annotations).not.toBe(out.pages[0]!.annotations) // array propio
    const copy = out.pages[1]!.annotations[0]!
    expect(copy.id).not.toBe(ann.id) // id nuevo
    expect(copy.kind).toBe('text')
    if (copy.kind === 'text') expect(copy.text).toBe('firma') // mismo contenido
    expect(out.sources.length).toBe(1) // comparten el source
    expect(duplicatePages(d, [])).toBe(d)
  })

  it('duplicatePages con varios índices inserta una copia tras cada uno (orden correcto)', () => {
    const d = addPdfSource(emptyDoc(), pdf(), 3) // p0,p1,p2
    const out = duplicatePages(d, [0, 2])
    // p0, copia(p0), p1, p2, copia(p2)
    expect(out.pages.length).toBe(5)
    expect(out.pages[0]!.id).toBe(d.pages[0]!.id)
    expect(out.pages[2]!.id).toBe(d.pages[1]!.id) // p1 intacto en posición 2
    expect(out.pages[4]!.id).not.toBe(d.pages[2]!.id) // copia de p2 al final
  })

  it('subsetDoc deja sólo las páginas pedidas, EN ORDEN de documento, y poda sources', () => {
    let d = addPdfSource(emptyDoc(), pdf(), 2) // p0,p1 (pdf)
    d = addImageSource(d, img()) // p2 (img)
    const out = subsetDoc(d, [2, 0]) // pide p2 y p0 (orden inverso)
    expect(out.pages.map((p) => p.kind)).toEqual(['pdf', 'image']) // orden de doc
    expect(out.sources.length).toBe(2)
    expect(subsetDoc(d, []).pages).toEqual([]) // vacío
    expect(subsetDoc(d, []).sources).toEqual([]) // sin páginas → sin sources
  })
})

describe('pdfStudio/model · anotaciones polimórficas', () => {
  const aText = () =>
    makeTextAnnotation({
      text: 'x',
      xRatio: 0.1,
      yRatio: 0.1,
      sizeRatio: 0.04,
      color: '#000000',
      font: 'sans',
      bold: false,
    })
  const aHighlight = () =>
    makeHighlightAnnotation({
      xRatio: 0.1,
      yRatio: 0.2,
      wRatio: 0.3,
      hRatio: 0.05,
      color: '#ffee00',
    })

  it('makeHighlightAnnotation crea un resaltado (kind highlight, id propio)', () => {
    const h = aHighlight()
    expect(h.kind).toBe('highlight')
    expect(h.id).toBeTruthy()
    expect(h.wRatio).toBe(0.3)
  })

  it('isTextAnnotation distingue texto de resaltado', () => {
    expect(isTextAnnotation(aText())).toBe(true)
    expect(isTextAnnotation(aHighlight())).toBe(false)
  })

  it('normalizeDoc pone kind:text a anotaciones viejas (sin kind), respeta las que ya lo tienen', () => {
    // Borrador VIEJO: una anotación de texto SIN `kind` (de antes de la unión).
    const old = {
      id: 'x1',
      text: 'hola',
      xRatio: 0.1,
      yRatio: 0.1,
      sizeRatio: 0.04,
      color: '#000',
      font: 'sans',
      bold: false,
    }
    let d = addImageSource(emptyDoc(), img())
    d = setPageAnnotations(d, 0, [old as unknown as Annotation, aHighlight()])
    const norm = normalizeDoc(d)
    expect(norm.pages[0]!.annotations[0]!.kind).toBe('text') // se le puso kind
    expect(norm.pages[0]!.annotations[1]!.kind).toBe('highlight') // respeta el existente
  })
})
