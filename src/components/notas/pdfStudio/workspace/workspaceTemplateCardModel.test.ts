import { describe, expect, it } from 'vitest'
import { emptyDoc, type PdfDoc } from '../../../../lib/pdfStudio/model/model'
import {
  templateCloudBadge,
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

describe('templateCloudBadge', () => {
  it('distingue en-la-nube, cambios sin subir y solo local', () => {
    const at = Date.parse('2026-07-03T12:00:00.000Z')
    expect(templateCloudBadge({ savedAt: at })).toMatchObject({ tone: 'local' })
    expect(
      templateCloudBadge({
        savedAt: at,
        cloudTemplate: { id: 'r1', savedAt: '2026-07-03T12:00:01.000Z' },
      }),
    ).toMatchObject({ tone: 'cloud', label: 'En la nube' })
    expect(
      templateCloudBadge({
        savedAt: at + 60_000,
        cloudTemplate: { id: 'r1', savedAt: '2026-07-03T12:00:00.000Z' },
      }),
    ).toMatchObject({ tone: 'pending', label: 'Cambios sin subir' })
  })
})
