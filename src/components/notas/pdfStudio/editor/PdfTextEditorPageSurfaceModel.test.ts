import { describe, expect, it } from 'vitest'
import { pdfTextEditorPageSurfacePermissions } from './PdfTextEditorPageSurfaceModel'

describe('PdfTextEditorPageSurfaceModel', () => {
  it('deriva permisos de anotaciones y marcas X por modo', () => {
    expect(pdfTextEditorPageSurfacePermissions('edit')).toEqual({
      canEditAnnotations: true,
      canToggleXMarks: true,
      fillMode: false,
    })
    expect(pdfTextEditorPageSurfacePermissions('design')).toEqual({
      canEditAnnotations: true,
      canToggleXMarks: true,
      fillMode: false,
    })
    expect(pdfTextEditorPageSurfacePermissions('fill')).toEqual({
      canEditAnnotations: false,
      canToggleXMarks: true,
      fillMode: true,
    })
  })
})
