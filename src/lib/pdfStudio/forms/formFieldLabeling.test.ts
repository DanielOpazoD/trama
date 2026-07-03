import { describe, expect, it } from 'vitest'
import { makePdfFormFieldDraft } from '../model/modelForms'
import type { PdfFormFieldDraft } from '../model/modelTypes'
import {
  cleanFieldLabel,
  labelSuggestedFields,
  type PageTextItemRatio,
} from './formFieldLabeling'

function suggestion(box: {
  xRatio: number
  yRatio: number
  wRatio?: number
  hRatio?: number
}): PdfFormFieldDraft {
  return makePdfFormFieldDraft({
    fieldKind: 'text',
    pageId: 'p1',
    name: 'campo_1',
    value: '',
    wRatio: 0.3,
    hRatio: 0.04,
    ...box,
  })
}

function item(
  text: string,
  xRatio: number,
  yRatio: number,
  wRatio = 0.08,
  hRatio = 0.02,
): PageTextItemRatio {
  return { text, xRatio, yRatio, wRatio, hRatio }
}

describe('labelSuggestedFields', () => {
  it('usa la etiqueta a la izquierda como nombre, uniendo palabras contiguas', () => {
    const fields = [suggestion({ xRatio: 0.3, yRatio: 0.2 })]
    const items = [
      item('Nombre del', 0.05, 0.21, 0.1),
      item('paciente:', 0.16, 0.21, 0.1),
      item('Otra cosa lejana', 0.05, 0.5),
    ]
    const [labeled] = labelSuggestedFields({ fields, items })
    expect(labeled!.name).toBe('Nombre del paciente')
    expect(labeled!.fieldKind).toBe('text')
  })

  it('infiere tipo date/signature desde la etiqueta', () => {
    const fields = [
      suggestion({ xRatio: 0.3, yRatio: 0.2 }),
      suggestion({ xRatio: 0.3, yRatio: 0.4 }),
    ]
    const items = [
      item('Fecha de nacimiento:', 0.1, 0.21, 0.15),
      item('Firma del profesional', 0.08, 0.41, 0.17),
    ]
    const labeled = labelSuggestedFields({ fields, items })
    expect(labeled[0]).toMatchObject({ name: 'Fecha de nacimiento', fieldKind: 'date' })
    expect(labeled[0]!.autoFill).toBeUndefined()
    expect(labeled[1]).toMatchObject({
      name: 'Firma del profesional',
      fieldKind: 'signature',
    })
  })

  it('«Fecha» simple queda con fecha de hoy automática; nacimiento no', () => {
    const fields = [suggestion({ xRatio: 0.3, yRatio: 0.2 })]
    const items = [item('Fecha:', 0.2, 0.21, 0.06)]
    const [labeled] = labelSuggestedFields({ fields, items })
    expect(labeled).toMatchObject({ name: 'Fecha', fieldKind: 'date', autoFill: 'today' })
  })

  it('descarta el subrayado que ya tiene texto encima y respeta etiquetas lejanas', () => {
    const fields = [
      suggestion({ xRatio: 0.3, yRatio: 0.2 }),
      suggestion({ xRatio: 0.6, yRatio: 0.6 }),
    ]
    const items = [
      // texto centrado SOBRE el primer subrayado (texto subrayado, no vacío)
      item('Título subrayado', 0.33, 0.21, 0.2),
      // etiqueta demasiado lejos del segundo casillero (> gap máximo)
      item('Lejos', 0.1, 0.61, 0.05),
    ]
    const labeled = labelSuggestedFields({ fields, items })
    expect(labeled).toHaveLength(1)
    expect(labeled[0]!.name).toBe('campo_1')
  })
})

describe('cleanFieldLabel', () => {
  it('quita dos puntos finales, viñetas y espacios repetidos', () => {
    expect(cleanFieldLabel('  Nombre   del paciente : ')).toBe('Nombre del paciente')
    expect(cleanFieldLabel('- RUT:')).toBe('RUT')
    expect(cleanFieldLabel('Teléfono____')).toBe('Teléfono')
  })
})
