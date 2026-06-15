import { describe, expect, it } from 'vitest'
import {
  applyEdits,
  cloneAnnotation,
  makeTextAnnotation,
  setPageAnnotations,
  translateAnnotation,
} from './modelAnnotations'
import {
  addImageSource,
  addPdfSource,
  canExport,
  emptyDoc,
  getSource,
  pageThumbKey,
  replacePdfSourceFile,
  setDocTitle,
  subsetDoc,
} from './modelDocument'
import { deletePages, duplicatePages, movePage, rotatePages } from './modelPages'

const pdf = (name = 'a.pdf') => new File(['%PDF'], name, { type: 'application/pdf' })
const img = (name = 'a.png') => new File(['x'], name, { type: 'image/png' })

describe('pdfStudio/model modules', () => {
  it('mantiene fuentes y paginas en el modulo de documento', () => {
    const original = pdf('original.pdf')
    const replacement = pdf('replacement.pdf')
    const doc = addImageSource(addPdfSource(emptyDoc(), original, 2), img())
    const pdfPage = doc.pages.find((page) => page.kind === 'pdf')!
    const pdfSource = getSource(doc, pdfPage.sourceId)!

    const renamed = setDocTitle(
      replacePdfSourceFile(doc, pdfSource.id, replacement),
      '  Caso ',
    )

    expect(canExport(renamed)).toBe(true)
    expect(renamed.title).toBe('Caso')
    expect(getSource(renamed, pdfSource.id)?.file).toBe(replacement)
    expect(pageThumbKey(pdfPage)).toMatch(/:0$/)
    expect(subsetDoc(renamed, [0, 2]).pages).toHaveLength(2)
  })

  it('concentra operaciones de paginas sin tocar anotaciones directamente', () => {
    const doc = addPdfSource(emptyDoc(), pdf(), 3)
    const ids = doc.pages.map((page) => page.id)

    const moved = movePage(doc, 0, 2)
    const rotated = rotatePages(moved, [0, 2], 1)
    const duplicated = duplicatePages(rotated, [1])
    const deleted = deletePages(duplicated, [0])

    expect(moved.pages.map((page) => page.id)).toEqual([ids[1], ids[2], ids[0]])
    expect(rotated.pages.map((page) => page.rotationQuarters)).toEqual([1, 0, 1])
    expect(duplicated.pages).toHaveLength(4)
    expect(deleted.pages).toHaveLength(3)
  })

  it('concentra factories y ediciones de anotaciones en su modulo propio', () => {
    const doc = addPdfSource(emptyDoc(), pdf(), 2)
    const annotation = makeTextAnnotation({
      text: 'nota',
      xRatio: 0.1,
      yRatio: 0.2,
      sizeRatio: 0.04,
      color: '#111111',
      font: 'sans',
      bold: false,
    })
    const moved = translateAnnotation(annotation, 0.2, -0.1)
    const cloned = cloneAnnotation(moved)
    const edited = applyEdits(setPageAnnotations(doc, 0, [annotation]), {
      1: [cloned],
    })

    expect(moved.kind).toBe('text')
    expect(cloned.id).not.toBe(annotation.id)
    expect(edited.pages[0]!.annotations).toEqual([annotation])
    expect(edited.pages[1]!.annotations).toEqual([cloned])
  })
})
