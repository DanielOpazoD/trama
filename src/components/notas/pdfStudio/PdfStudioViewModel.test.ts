import { describe, expect, it } from 'vitest'

import { addPdfSource, emptyDoc } from '../../../lib/pdfStudio/model/model'
import type { SavedDoc } from '../../../lib/pdfStudio/render/persistence'
import {
  canCropPdfStudioSelection,
  pdfStudioHasVisibleSaved,
  pdfStudioTextEditorMode,
} from './PdfStudioViewModel'

function saved(overrides: Partial<SavedDoc> = {}): SavedDoc {
  return {
    doc: emptyDoc(),
    id: 'saved-a',
    name: 'Guardado',
    savedAt: 1,
    ...overrides,
  }
}

describe('PdfStudioViewModel', () => {
  it('muestra guardados segun modo editor o planillas', () => {
    const plain = saved()
    const template = saved({
      doc: { ...emptyDoc(), formFields: [{ id: 'field-a' }] } as SavedDoc['doc'],
    })

    expect(pdfStudioHasVisibleSaved({ saved: [plain], templatesEnabled: false })).toBe(
      true,
    )
    expect(pdfStudioHasVisibleSaved({ saved: [template], templatesEnabled: false })).toBe(
      false,
    )
    expect(pdfStudioHasVisibleSaved({ saved: [template], templatesEnabled: true })).toBe(
      true,
    )
  })

  it('permite crop solo con una pagina real seleccionada', () => {
    const doc = addPdfSource(emptyDoc(), new File(['%PDF'], 'a.pdf'), 2)

    expect(
      canCropPdfStudioSelection({ doc, selectedCount: 1, selectedIndices: [0] }),
    ).toBe(true)
    expect(
      canCropPdfStudioSelection({ doc, selectedCount: 2, selectedIndices: [0, 1] }),
    ).toBe(false)
    expect(
      canCropPdfStudioSelection({ doc, selectedCount: 1, selectedIndices: [9] }),
    ).toBe(false)
  })

  it('traduce templateMode a modo del editor de texto', () => {
    expect(pdfStudioTextEditorMode('fill')).toBe('fill')
    expect(pdfStudioTextEditorMode('design')).toBe('edit')
    expect(pdfStudioTextEditorMode(null)).toBe('edit')
  })
})
