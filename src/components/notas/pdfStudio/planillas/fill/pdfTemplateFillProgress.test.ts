import { describe, expect, it } from 'vitest'
import { makePdfFormFieldDraft } from '../../../../../lib/pdfStudio/model/model'
import {
  fillProgressForTemplateFields,
  requiredEmptyTemplateFields,
  valueAsFillText,
} from './pdfTemplateFillProgress'

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
      requiredPending: 0,
      total: 2,
    })
  })

  it('cuenta requeridos vacíos aparte de los pendientes comunes', () => {
    const base = {
      fieldKind: 'text' as const,
      pageId: 'p1',
      xRatio: 0.1,
      yRatio: 0.1,
      wRatio: 0.2,
      hRatio: 0.05,
    }
    const fields = [
      makePdfFormFieldDraft({ ...base, name: 'libre', value: '' }),
      makePdfFormFieldDraft({ ...base, name: 'req_vacio', value: '', required: true }),
      makePdfFormFieldDraft({ ...base, name: 'req_lleno', value: 'ok', required: true }),
    ]

    expect(fillProgressForTemplateFields(fields)).toEqual({
      completed: 1,
      pending: 2,
      requiredPending: 1,
      total: 3,
    })
    expect(requiredEmptyTemplateFields(fields).map((f) => f.name)).toEqual(['req_vacio'])
  })
})
