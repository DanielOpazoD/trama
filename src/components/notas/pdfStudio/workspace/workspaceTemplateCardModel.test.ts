import { describe, expect, it } from 'vitest'
import { emptyDoc, type PdfDoc } from '../../../../lib/pdfStudio/model/model'
import {
  workspaceTemplateFieldCountLabel,
  workspaceTemplateSavedAtLabel,
} from './workspaceTemplateCardModel'

describe('workspaceTemplateCardModel', () => {
  it('formatea fecha guardada con hora local compacta', () => {
    const savedAt = new Date(2026, 0, 2, 3, 4).getTime()

    expect(workspaceTemplateSavedAtLabel(savedAt)).toBe('2/1 03:04')
  })

  it('pluraliza cantidad de campos de planilla', () => {
    expect(workspaceTemplateFieldCountLabel(emptyDoc())).toBe('0 campos')
    expect(
      workspaceTemplateFieldCountLabel({
        ...emptyDoc(),
        formFields: [{ id: 'field-a' }],
      } as PdfDoc),
    ).toBe('1 campo')
    expect(
      workspaceTemplateFieldCountLabel({
        ...emptyDoc(),
        formFields: [{ id: 'field-a' }, { id: 'field-b' }],
      } as PdfDoc),
    ).toBe('2 campos')
  })
})
