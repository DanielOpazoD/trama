import { describe, expect, it } from 'vitest'

import { addPdfSource, emptyDoc } from '../../../lib/pdfStudio/model/model'
import type { SavedDoc } from '../../../lib/pdfStudio/render/persistence'
import {
  canCropPdfStudioSelection,
  derivePdfStudioViewLayoutState,
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

  it('deriva estado de layout del shell PDF sin depender del componente', () => {
    const plainDoc = addPdfSource(emptyDoc(), new File(['%PDF'], 'a.pdf'), 2)
    const templateDoc = {
      ...plainDoc,
      formFields: [{ id: 'field-a' }],
    } as typeof plainDoc

    expect(
      derivePdfStudioViewLayoutState({
        doc: emptyDoc(),
        saved: [],
        selectedCount: 0,
        selectedIndices: [],
        templateMode: null,
        templatesEnabled: false,
      }),
    ).toEqual({
      canCropSelectedPage: false,
      canSaveTemplate: false,
      empty: true,
      hasVisibleSaved: false,
      showEditBar: false,
      showPanel: false,
      total: 0,
    })

    expect(
      derivePdfStudioViewLayoutState({
        doc: plainDoc,
        saved: [saved()],
        selectedCount: 1,
        selectedIndices: [1],
        templateMode: null,
        templatesEnabled: false,
      }),
    ).toMatchObject({
      canCropSelectedPage: true,
      canSaveTemplate: false,
      empty: false,
      hasVisibleSaved: true,
      showEditBar: true,
      showPanel: true,
      total: 2,
    })

    expect(
      derivePdfStudioViewLayoutState({
        doc: templateDoc,
        saved: [],
        selectedCount: 1,
        selectedIndices: [0],
        templateMode: 'fill',
        templatesEnabled: true,
      }),
    ).toMatchObject({
      canSaveTemplate: true,
      showEditBar: false,
      showPanel: true,
    })
  })
})
