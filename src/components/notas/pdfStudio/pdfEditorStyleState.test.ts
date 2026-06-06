import { describe, expect, it } from 'vitest'
import {
  applyEditorStylePatch,
  defaultEditorTextStyle,
  resolveActiveEditorStyle,
} from './pdfEditorStyleState'
import type { Annotation } from '../../../lib/pdfStudio/model'
import type { TextStyle } from './editorStyle'

const baseStyle: TextStyle = defaultEditorTextStyle()

const annotations: Annotation[] = [
  {
    id: 'txt',
    kind: 'text',
    text: 'Hola',
    xRatio: 0.1,
    yRatio: 0.2,
    sizeRatio: 0.04,
    color: '#222222',
    font: 'sans',
    bold: false,
    opacity: 1,
    rotation: 0,
  },
  {
    id: 'hl',
    kind: 'highlight',
    xRatio: 0.1,
    yRatio: 0.2,
    wRatio: 0.3,
    hRatio: 0.1,
    color: '#222222',
    opacity: 0.35,
  },
  {
    id: 'img',
    kind: 'image',
    src: 'data:image/png;base64,x',
    xRatio: 0.1,
    yRatio: 0.2,
    wRatio: 0.3,
    hRatio: 0.1,
    opacity: 1,
  },
]

describe('pdfEditorStyleState', () => {
  it('resuelve el estilo activo desde una selección de texto o desde el default', () => {
    expect(resolveActiveEditorStyle(null, baseStyle)).toEqual(baseStyle)
    expect(resolveActiveEditorStyle(annotations[0]!, baseStyle)).toMatchObject({
      font: 'sans',
      color: '#222222',
      sizeRatio: 0.04,
    })
  })

  it('aplica todos los campos de estilo al texto seleccionado', () => {
    const out = applyEditorStylePatch(annotations, 'txt', {
      font: 'serif',
      bold: true,
      color: '#f2c94c',
      opacity: 0.6,
      rotation: 15,
    })

    expect(out.find((a) => a.id === 'txt')).toMatchObject({
      font: 'serif',
      bold: true,
      color: '#f2c94c',
      opacity: 0.6,
      rotation: 15,
    })
  })

  it('limita resaltados y formas a color/opacidad, e imágenes sólo a opacidad', () => {
    const patch: Partial<TextStyle> = {
      font: 'mono',
      bold: true,
      color: '#f2c94c',
      opacity: 0.5,
      rotation: 30,
    }

    expect(
      applyEditorStylePatch(annotations, 'hl', patch).find((a) => a.id === 'hl'),
    ).toEqual(expect.objectContaining({ color: '#f2c94c', opacity: 0.5 }))
    expect(
      applyEditorStylePatch(annotations, 'img', patch).find((a) => a.id === 'img'),
    ).toEqual(expect.objectContaining({ opacity: 0.5 }))
  })
})
