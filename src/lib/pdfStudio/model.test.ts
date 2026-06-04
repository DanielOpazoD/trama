import { describe, it, expect } from 'vitest'
import {
  addImageSource,
  addPdfSource,
  canExport,
  deletePage,
  emptyDoc,
  getSource,
  movePage,
  movePageByDelta,
  pageThumbKey,
  replacePageWithImage,
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
