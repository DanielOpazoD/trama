import { describe, expect, it } from 'vitest'
import {
  makePdfFormFieldDraft,
  type PdfFormFieldDraft,
} from '../../../lib/pdfStudio/model/model'
import { alignFormFields, distributeFormFields } from './pdfFormFieldArrange'

const field = (
  id: string,
  xRatio: number,
  yRatio: number,
  wRatio = 0.18,
): PdfFormFieldDraft => ({
  ...makePdfFormFieldDraft({
    fieldKind: 'text',
    pageId: 'p1',
    name: id,
    value: '',
    xRatio,
    yRatio,
    wRatio,
    hRatio: 0.04,
  }),
  id,
})

describe('pdfFormFieldArrange', () => {
  it('alinea un casillero contra la página', () => {
    const fields = [field('a', 0.25, 0.1)]

    expect(alignFormFields(fields, ['a'], 'left')[0]).toMatchObject({ xRatio: 0 })
    expect(alignFormFields(fields, ['a'], 'center')[0]?.xRatio).toBeCloseTo(0.41)
    expect(alignFormFields(fields, ['a'], 'right')[0]?.xRatio).toBeCloseTo(0.82)
  })

  it('alinea múltiples casilleros al borde de la selección', () => {
    const fields = [field('a', 0.3, 0.1), field('b', 0.1, 0.2)]

    const aligned = alignFormFields(fields, ['a', 'b'], 'right')

    expect(aligned[0]).toMatchObject({ xRatio: 0.3 })
    expect(aligned[1]).toMatchObject({ xRatio: 0.3 })
  })

  it('distribuye tres o más casilleros por centro', () => {
    const fields = [field('a', 0.1, 0.1), field('b', 0.3, 0.1), field('c', 0.7, 0.1)]

    const distributed = distributeFormFields(fields, ['a', 'b', 'c'], 'x')

    expect(distributed[0]).toMatchObject({ xRatio: 0.1 })
    expect(distributed[1]?.xRatio).toBeCloseTo(0.4)
    expect(distributed[2]).toMatchObject({ xRatio: 0.7 })
  })
})
