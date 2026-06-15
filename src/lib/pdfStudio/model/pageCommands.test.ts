import { describe, expect, it } from 'vitest'
import { addPdfSource, emptyDoc } from './modelDocument'
import { reducePdfPageCommand } from './pageCommands'

const pdf = (name = 'a.pdf') => new File(['%PDF'], name, { type: 'application/pdf' })

describe('pdfStudio page command reducer', () => {
  it('aplica comandos puros de paginas y preserva compatibilidad del modelo', () => {
    const doc = addPdfSource(emptyDoc(), pdf(), 3)
    const ids = doc.pages.map((page) => page.id)

    const rotated = reducePdfPageCommand(doc, {
      type: 'rotatePages',
      indices: [0, 2],
      delta: 1,
    })
    const duplicated = reducePdfPageCommand(rotated, {
      type: 'duplicatePages',
      indices: [1],
    })
    const moved = reducePdfPageCommand(duplicated, {
      type: 'movePage',
      from: 0,
      to: 2,
    })

    expect(rotated.pages.map((page) => page.rotationQuarters)).toEqual([1, 0, 1])
    expect(duplicated.pages).toHaveLength(4)
    expect(moved.pages.map((page) => page.id).slice(0, 3)).toEqual([
      ids[1],
      duplicated.pages[2]!.id,
      ids[0],
    ])
  })

  it('devuelve documento/subdocumento y no muta el original', () => {
    const doc = addPdfSource(emptyDoc(), pdf(), 4)
    const selected = reducePdfPageCommand(doc, {
      type: 'subsetDoc',
      indices: [1, 3],
    })
    const deleted = reducePdfPageCommand(doc, {
      type: 'deletePages',
      indices: [1, 3],
    })

    expect(selected.pages.map((page) => page.id)).toEqual([
      doc.pages[1]!.id,
      doc.pages[3]!.id,
    ])
    expect(deleted.pages.map((page) => page.id)).toEqual([
      doc.pages[0]!.id,
      doc.pages[2]!.id,
    ])
    expect(doc.pages).toHaveLength(4)
  })
})
