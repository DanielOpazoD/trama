import { describe, expect, it } from 'vitest'
import { makePdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import {
  latestSelectedFormFieldId,
  mergeSelectedFormFieldIds,
  nextSelectedFormFieldIds,
  patchDraftFormFields,
  removeSelectedFormFieldId,
} from './pdfTextEditorFormDraftModel'

const field = (id: string, name = id) => ({
  ...makePdfFormFieldDraft({
    fieldKind: 'text',
    hRatio: 0.1,
    name,
    pageId: 'page-a',
    value: '',
    wRatio: 0.2,
    xRatio: 0.1,
    yRatio: 0.1,
  }),
  id,
})

describe('pdfTextEditorFormDraftModel', () => {
  it('mantiene la seleccion principal como el ultimo id seleccionado', () => {
    expect(latestSelectedFormFieldId([])).toBeNull()
    expect(latestSelectedFormFieldId(['a', 'b'])).toBe('b')
  })

  it('calcula seleccion simple y aditiva sin mutar el arreglo original', () => {
    const selected = ['a']

    expect(nextSelectedFormFieldIds(selected, 'b')).toEqual(['b'])
    expect(nextSelectedFormFieldIds(selected, 'b', true)).toEqual(['a', 'b'])
    expect(nextSelectedFormFieldIds(['a', 'b'], 'a', true)).toEqual(['b'])
    expect(selected).toEqual(['a'])
  })

  it('remueve un campo eliminado desde la seleccion', () => {
    expect(removeSelectedFormFieldId(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('une la seleccion con los ids del marco sin duplicar y conservando orden', () => {
    expect(mergeSelectedFormFieldIds(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
    expect(mergeSelectedFormFieldIds([], ['x'])).toEqual(['x'])
  })

  it('normaliza nombre al parchear y conserva fallback si queda vacio', () => {
    const fields = [field('a', 'old_name'), field('b', 'otro')]

    expect(patchDraftFormFields(fields, 'a', { name: ' nuevo campo ' })[0]).toMatchObject(
      { name: 'nuevo_campo' },
    )
    expect(patchDraftFormFields(fields, 'a', { name: '   ' })[0]).toMatchObject({
      name: 'old_name',
    })
    expect(patchDraftFormFields(fields, 'a', { value: 'ok' })[0]).toMatchObject({
      name: 'old_name',
      value: 'ok',
    })
  })
})
