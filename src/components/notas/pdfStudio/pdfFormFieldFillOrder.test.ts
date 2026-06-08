import { describe, expect, it } from 'vitest'
import {
  makePdfFormFieldDraft,
  type PdfFormFieldDraft,
} from '../../../lib/pdfStudio/model/model'
import { orderFormFieldsForFill } from './pdfFormFieldFillOrder'

const field = (
  id: string,
  pageId: string,
  xRatio: number,
  yRatio: number,
): PdfFormFieldDraft => ({
  ...makePdfFormFieldDraft({
    fieldKind: 'text',
    pageId,
    name: id,
    value: '',
    xRatio,
    yRatio,
    wRatio: 0.2,
    hRatio: 0.04,
  }),
  id,
})

describe('pdfFormFieldFillOrder', () => {
  it('ordena casilleros por página, fila y columna sin mutar el origen', () => {
    const fields = [
      field('c', 'p2', 0.1, 0.1),
      field('b', 'p1', 0.6, 0.2),
      field('a', 'p1', 0.2, 0.2),
      field('d', 'p0', 0.1, 0.1),
    ]

    expect(orderFormFieldsForFill(fields, { p1: 1, p2: 2 }).map((f) => f.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
    expect(fields.map((f) => f.id)).toEqual(['c', 'b', 'a', 'd'])
  })
})
