import { describe, expect, it } from 'vitest'

import {
  editorToolbarContextCapabilities,
  editorToolbarPrimaryInsertAction,
  isMacLikeUserAgent,
} from './EditorToolbarModel'

describe('EditorToolbarModel', () => {
  it('trata user agents Mac/iOS como Mac-like para shortcuts', () => {
    expect(isMacLikeUserAgent(undefined)).toBe(true)
    expect(isMacLikeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe(true)
    expect(isMacLikeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS)')).toBe(true)
    expect(isMacLikeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false)
  })

  it('define la accion primaria segun contexto editor/planilla', () => {
    expect(editorToolbarPrimaryInsertAction('editor')).toEqual({
      fieldKind: null,
      hint: 'Agregar un cuadro editable',
      label: 'Agregar cuadro de texto',
    })
    expect(editorToolbarPrimaryInsertAction('templateDesign')).toEqual({
      fieldKind: 'text',
      hint: 'Crear un casillero rellenable · atajo: Shift + clic en la página',
      label: 'Crear casillero de texto',
    })
  })

  it('deriva capacidades visibles de toolbar segun contexto', () => {
    expect(editorToolbarContextCapabilities('editor')).toEqual({
      canShowPdfMarkupTools: true,
      canShowShapeTools: true,
      canStampImage: true,
    })
    expect(editorToolbarContextCapabilities('templateDesign')).toEqual({
      canShowPdfMarkupTools: false,
      canShowShapeTools: false,
      canStampImage: false,
    })
  })
})
