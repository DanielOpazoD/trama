import { describe, expect, it } from 'vitest'
import { makePdfFormFieldDraft } from '../../../lib/pdfStudio/model/model'
import { fillProgressForTemplateFields, valueAsFillText } from './pdfTemplateFillProgress'

describe('pdfTemplateFillProgress', () => {
  it('trata placeholders como vacíos y cuenta campos completados', () => {
    const empty = makePdfFormFieldDraft({
      fieldKind: 'text',
      pageId: 'p1',
      name: 'paciente',
      value: 'Escriba aquí',
      xRatio: 0,
      yRatio: 0,
      wRatio: 0.2,
      hRatio: 0.05,
    })
    const filled = makePdfFormFieldDraft({
      fieldKind: 'text',
      pageId: 'p1',
      name: 'rut',
      value: '12.345',
      xRatio: 0,
      yRatio: 0.1,
      wRatio: 0.2,
      hRatio: 0.05,
    })

    expect(valueAsFillText(empty.value)).toBe('')
    expect(fillProgressForTemplateFields([empty, filled])).toEqual({
      completed: 1,
      pending: 1,
      total: 2,
    })
  })
})
