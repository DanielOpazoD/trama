import type { Dispatch, SetStateAction } from 'react'
import {
  cloneAnnotation,
  makeTextAnnotation,
  translateAnnotation,
  type Annotation,
  type ImageAnnotation,
  type TextAnnotation,
} from '../../../../lib/pdfStudio/model/model'
import type { PageLayout } from '../../../../lib/pdfStudio/model/editorGeometry'
import { type TextStyle, type Tool } from './editorStyle'
import { createImageStampAnnotation } from './pdfImageStamp'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export function usePdfTextEditorInsertions({
  activeLayout,
  setAnnotations,
  setEditingId,
  setSelectedId,
  setTool,
  style,
}: {
  activeLayout: PageLayout | null
  setAnnotations: (fn: (list: Annotation[]) => Annotation[]) => void
  setEditingId: Dispatch<SetStateAction<string | null>>
  setSelectedId: (id: string | null) => void
  setTool: Dispatch<SetStateAction<Tool>>
  style: TextStyle
}) {
  function addText() {
    const a = makeTextAnnotation({
      text: 'Texto',
      xRatio: 0.2,
      yRatio: 0.2,
      wRatio: 0.24,
      hRatio: Math.max(0.055, style.sizeRatio * 1.7),
      sizeRatio: style.sizeRatio,
      color: style.color,
      font: style.font,
      bold: style.bold,
      italic: style.italic,
      opacity: style.opacity,
      rotation: style.rotation,
    })
    setTool('select')
    setAnnotations((l) => [...l, a])
    setSelectedId(a.id)
    setEditingId(a.id)
  }

  async function addImageStamp(file: File) {
    const a = await createImageStampAnnotation({
      file,
      layout: activeLayout,
      opacity: style.opacity,
    })
    if (a) insertImageAnnotation(a)
  }

  function insertImageAnnotation(a: ImageAnnotation) {
    setTool('select')
    setEditingId(null)
    setAnnotations((l) => [...l, a])
    setSelectedId(a.id)
  }

  function duplicateText(a: TextAnnotation) {
    const { id: _id, kind: _kind, ...rest } = a
    const copy = makeTextAnnotation({
      ...rest,
      xRatio: clamp01(a.xRatio + 0.03),
      yRatio: clamp01(a.yRatio + 0.03),
    })
    setAnnotations((l) => [...l, copy])
    setSelectedId(copy.id)
  }

  function duplicateImage(a: ImageAnnotation) {
    const copy = translateAnnotation(cloneAnnotation(a), 0.03, 0.03)
    setAnnotations((l) => [...l, copy])
    setSelectedId(copy.id)
  }

  return { addImageStamp, addText, duplicateImage, duplicateText, insertImageAnnotation }
}
