import { describe, expect, it } from 'vitest'
import {
  makePdfFormFieldDraft,
  type PdfFormFieldDraft,
} from '../../../../lib/pdfStudio/model/model'
import {
  alignFormFields,
  distributeFormFields,
  formFieldIdsInBox,
  matchFormFieldsSize,
} from './pdfFormFieldArrange'

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

  it('alinea verticalmente: arriba, medio y abajo de la selección', () => {
    const fields = [field('a', 0.1, 0.1), field('b', 0.5, 0.5)]

    const top = alignFormFields(fields, ['a', 'b'], 'top')
    expect(top[0]).toMatchObject({ yRatio: 0.1 })
    expect(top[1]).toMatchObject({ yRatio: 0.1 })
    // La X no se toca al alinear en vertical.
    expect(top[1]).toMatchObject({ xRatio: 0.5 })

    const bottom = alignFormFields(fields, ['a', 'b'], 'bottom')
    expect(bottom[0]?.yRatio).toBeCloseTo(0.5)
    expect(bottom[1]?.yRatio).toBeCloseTo(0.5)

    const middle = alignFormFields(fields, ['a', 'b'], 'middle')
    expect(middle[0]?.yRatio).toBeCloseTo(0.3)
    expect(middle[1]?.yRatio).toBeCloseTo(0.3)
  })

  it('alinea un solo casillero verticalmente contra la página', () => {
    const fields = [field('a', 0.25, 0.4)]

    expect(alignFormFields(fields, ['a'], 'top')[0]).toMatchObject({ yRatio: 0 })
    expect(alignFormFields(fields, ['a'], 'bottom')[0]?.yRatio).toBeCloseTo(0.96)
    expect(alignFormFields(fields, ['a'], 'middle')[0]?.yRatio).toBeCloseTo(0.48)
  })

  it('iguala ancho y alto al casillero activo (referencia)', () => {
    const fields = [
      field('a', 0.1, 0.1, 0.1),
      field('b', 0.4, 0.2, 0.3),
      { ...field('c', 0.7, 0.3, 0.2), hRatio: 0.09 },
    ]

    const widths = matchFormFieldsSize(fields, ['a', 'b', 'c'], 'width', 'c')
    expect(widths[0]).toMatchObject({ wRatio: 0.2 })
    expect(widths[1]).toMatchObject({ wRatio: 0.2 })
    expect(widths[2]).toMatchObject({ wRatio: 0.2 })

    const heights = matchFormFieldsSize(fields, ['a', 'b', 'c'], 'height', 'c')
    expect(heights[0]).toMatchObject({ hRatio: 0.09 })
    expect(heights[1]).toMatchObject({ hRatio: 0.09 })
  })

  it('sin referencia explícita iguala al último SELECCIONADO, no al último del array', () => {
    // 'a' es el último en selección pero el primero en el array de campos.
    const fields = [field('a', 0.1, 0.1, 0.25), field('b', 0.4, 0.2, 0.1)]

    const widths = matchFormFieldsSize(fields, ['b', 'a'], 'width')

    expect(widths[0]).toMatchObject({ wRatio: 0.25 })
    expect(widths[1]).toMatchObject({ wRatio: 0.25 })
  })

  it('al igualar acota el tamaño para no salirse de la página', () => {
    const fields = [field('a', 0.9, 0.1, 0.05), field('b', 0.1, 0.2, 0.5)]

    const widths = matchFormFieldsSize(fields, ['a', 'b'], 'width', 'b')

    expect((widths[0]?.xRatio ?? 0) + (widths[0]?.wRatio ?? 0)).toBeLessThanOrEqual(1)
    expect(widths[0]?.wRatio).toBeCloseTo(0.1)
  })

  it('con menos de dos casilleros igualar no cambia nada', () => {
    const fields = [field('a', 0.1, 0.1)]
    expect(matchFormFieldsSize(fields, ['a'], 'width')).toBe(fields)
  })
})

describe('formFieldIdsInBox', () => {
  const fields = [field('a', 0.1, 0.1), field('b', 0.5, 0.5), field('c', 0.8, 0.8)]

  it('captura solo los casilleros de la página que tocan el marco', () => {
    const otherPage = { ...field('d', 0.1, 0.1), pageId: 'p2' }

    expect(
      formFieldIdsInBox([...fields, otherPage], 'p1', {
        xRatio: 0.05,
        yRatio: 0.05,
        wRatio: 0.5,
        hRatio: 0.5,
      }),
    ).toEqual(['a', 'b'])
  })

  it('basta con tocar el marco parcialmente', () => {
    expect(
      formFieldIdsInBox(fields, 'p1', {
        xRatio: 0.2,
        yRatio: 0.11,
        wRatio: 0.05,
        hRatio: 0.05,
      }),
    ).toEqual(['a'])
  })

  it('un marco sin área (clic) o sin página no captura nada', () => {
    expect(
      formFieldIdsInBox(fields, 'p1', { xRatio: 0.1, yRatio: 0.1, wRatio: 0, hRatio: 0 }),
    ).toEqual([])
    expect(
      formFieldIdsInBox(fields, null, {
        xRatio: 0,
        yRatio: 0,
        wRatio: 1,
        hRatio: 1,
      }),
    ).toEqual([])
  })
})
