import { describe, expect, it } from 'vitest'
import { makePdfFormFieldDraft } from '../../../../../lib/pdfStudio/model/model'
import { templateFillValuesJson } from './pdfTemplateFillExport'

const base = {
  pageId: 'p1',
  xRatio: 0.1,
  yRatio: 0.1,
  wRatio: 0.2,
  hRatio: 0.05,
}

describe('templateFillValuesJson', () => {
  it('exporta los valores como { variable: valor }, re-importable', () => {
    const fields = [
      makePdfFormFieldDraft({
        ...base,
        fieldKind: 'text',
        name: 'paciente',
        value: 'Camila',
      }),
      makePdfFormFieldDraft({
        ...base,
        fieldKind: 'checkbox',
        name: 'acepta',
        value: true,
      }),
      // El placeholder estándar cuenta como vacío, no como contenido.
      makePdfFormFieldDraft({
        ...base,
        fieldKind: 'text',
        name: 'diagnostico',
        value: 'Escriba aquí',
      }),
    ]

    expect(JSON.parse(templateFillValuesJson(fields))).toEqual({
      paciente: 'Camila',
      acepta: true,
      diagnostico: '',
    })
  })
})
