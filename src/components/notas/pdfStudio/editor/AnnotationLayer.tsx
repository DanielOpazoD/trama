import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  isTextAnnotation,
  type Annotation,
  type HighlightAnnotation,
  type ImageAnnotation,
  type RedactionAnnotation,
  type ShapeAnnotation,
  type TextAnnotation,
} from '../../../../lib/pdfStudio/model/model'
import { type ResizeHandle } from '../../../../lib/pdfStudio/model/editorGeometry'
import { AnnotationHighlightBox } from './AnnotationHighlightBox'
import { HighlightDrawingPreview } from './HighlightDrawingPreview'
import { AnnotationRedactionBox } from './AnnotationRedactionBox'
import { AnnotationTextBox } from './AnnotationTextBox'
import { AnnotationImageBox } from './AnnotationImageBox'
import { AnnotationShapeLayer } from './AnnotationShapeLayer'
import { SelectionLassoPreview } from './SelectionLassoPreview'
import { SelectionMarqueePreview } from './SelectionMarqueePreview'
import { SnapGuideLines } from './SnapGuideLines'
import { type Tool } from './editorStyle'
import type { SnapGuide } from './pdfAnnotationSnap'

export type DrawingRect = { x0: number; y0: number; x1: number; y1: number }

/**
 * Despachador de la capa de anotaciones: enruta cada `kind` a su componente
 * (texto/redacción/resaltado/imagen/formas-X) y dibuja guías, previews y la
 * selección por área. La lógica de selección y arrastre (con sus reglas de
 * solo-lectura y modificadores) vive acá y se pasa a cada subcomponente.
 */
export function AnnotationLayer({
  annotations,
  innerW,
  innerH,
  tool,
  selectedId,
  selectedIds = selectedId ? [selectedId] : [],
  editingId,
  zoom = 1,
  drawing,
  selectionMarquee,
  selectionLasso,
  snapGuides = [],
  drawColor,
  readOnly = false,
  onStartDrag,
  onSelect,
  onToggleSelect,
  onToggleDisabled,
  xToggleEnabled = false,
  onStartEdit,
  onCommitText,
  onCancelEdit,
  onStartResize,
}: {
  annotations: Annotation[]
  /** Ancho/alto en px de la página nativa (para el viewBox del SVG de formas y el
   *  tamaño de letra). */
  innerW: number
  innerH: number
  tool: Tool
  selectedId: string | null
  selectedIds?: string[]
  editingId: string | null
  zoom?: number
  drawing: DrawingRect | null
  selectionMarquee?: DrawingRect | null
  selectionLasso?: { x: number; y: number }[] | null
  snapGuides?: SnapGuide[]
  /** Color del resaltado en curso (para el preview punteado). */
  drawColor: string
  readOnly?: boolean
  onStartDrag: (e: ReactPointerEvent, a: Annotation) => void
  onSelect: (id: string) => void
  onToggleSelect?: (id: string) => void
  /** Clic sobre una marca X: la activa/desactiva (gris claro ↔ color). */
  onToggleDisabled?: (id: string) => void
  /** Permite togglear las marcas X aunque la capa sea solo-lectura (modo llenado). */
  xToggleEnabled?: boolean
  onStartEdit: (id: string) => void
  onCommitText: (id: string, text: string) => void
  onCancelEdit: () => void
  onStartResize: (
    e: ReactPointerEvent,
    a:
      | TextAnnotation
      | HighlightAnnotation
      | RedactionAnnotation
      | ImageAnnotation
      | ShapeAnnotation,
    handle: ResizeHandle,
  ) => void
}) {
  const selectedSet = new Set(selectedIds)
  const isSelected = (id: string) => selectedSet.has(id) || selectedId === id
  const selectFromClick = (e: ReactMouseEvent, id: string) => {
    e.stopPropagation()
    if (readOnly) return
    if ((e.metaKey || e.ctrlKey || e.shiftKey) && onToggleSelect) {
      onToggleSelect(id)
      return
    }
    onSelect(id)
  }
  const startDragFromPointer = (e: ReactPointerEvent, annotation: Annotation) => {
    if (readOnly) {
      e.stopPropagation()
      return
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      e.stopPropagation()
      return
    }
    onStartDrag(e, annotation)
  }

  return (
    <>
      <SnapGuideLines guides={snapGuides} />

      {annotations.filter(isTextAnnotation).map((a) => (
        <AnnotationTextBox
          key={a.id}
          annotation={a}
          innerW={innerW}
          innerH={innerH}
          tool={tool}
          selectedId={selectedId}
          selected={isSelected(a.id)}
          editing={editingId === a.id}
          zoom={zoom}
          readOnly={readOnly}
          onStartDrag={startDragFromPointer}
          onSelect={selectFromClick}
          onStartEdit={onStartEdit}
          onCommitText={onCommitText}
          onCancelEdit={onCancelEdit}
          onStartResize={onStartResize}
        />
      ))}

      {annotations
        .filter((a): a is RedactionAnnotation => a.kind === 'redaction')
        .map((a) => (
          <AnnotationRedactionBox
            key={a.id}
            annotation={a}
            innerW={innerW}
            innerH={innerH}
            tool={tool}
            selectedId={readOnly ? null : selectedId}
            selected={!readOnly && isSelected(a.id)}
            onStartDrag={startDragFromPointer}
            onSelect={selectFromClick}
            onStartResize={onStartResize}
            zoom={zoom}
          />
        ))}

      {annotations
        .filter((a) => a.kind === 'highlight')
        .map((a) => (
          <AnnotationHighlightBox
            key={a.id}
            annotation={a}
            innerW={innerW}
            innerH={innerH}
            tool={tool}
            selectedId={readOnly ? null : selectedId}
            selected={!readOnly && isSelected(a.id)}
            onStartDrag={startDragFromPointer}
            onSelect={selectFromClick}
            onStartResize={onStartResize}
            zoom={zoom}
          />
        ))}

      {annotations
        .filter((a): a is ImageAnnotation => a.kind === 'image')
        .map((a) => (
          <AnnotationImageBox
            key={a.id}
            annotation={a}
            innerW={innerW}
            innerH={innerH}
            tool={tool}
            selectedId={selectedId}
            selected={!readOnly && isSelected(a.id)}
            zoom={zoom}
            readOnly={readOnly}
            onStartDrag={startDragFromPointer}
            onSelect={selectFromClick}
            onStartResize={onStartResize}
          />
        ))}

      <AnnotationShapeLayer
        shapes={annotations.filter((a): a is ShapeAnnotation => a.kind === 'shape')}
        innerW={innerW}
        innerH={innerH}
        tool={tool}
        selectedId={selectedId}
        isSelected={isSelected}
        zoom={zoom}
        readOnly={readOnly}
        drawing={drawing}
        drawColor={drawColor}
        xToggleEnabled={xToggleEnabled}
        onStartDrag={startDragFromPointer}
        onSelect={selectFromClick}
        onToggleDisabled={onToggleDisabled}
        onStartResize={onStartResize}
      />

      {drawing && tool === 'highlight' && (
        <HighlightDrawingPreview rect={drawing} color={drawColor} />
      )}

      {selectionMarquee && tool === 'select' && (
        <SelectionMarqueePreview rect={selectionMarquee} />
      )}
      {selectionLasso && tool === 'select' && (
        <SelectionLassoPreview points={selectionLasso} width={innerW} height={innerH} />
      )}
    </>
  )
}
