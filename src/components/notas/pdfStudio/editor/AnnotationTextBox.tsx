import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import {
  baselineDropEm,
  previewFontFamily,
  TEXT_LINE_HEIGHT,
  type TextAnnotation,
} from '../../../../lib/pdfStudio/model/model'
import type { ResizeHandle } from '../../../../lib/pdfStudio/model/editorGeometry'
import type { ResizableAnnotation } from './pdfAnnotationResize'
import { AnnotationResizeHandles } from './AnnotationResizeHandles'
import { EditableBox } from './EditableBox'
import { ACCENT, HIT_X, HIT_Y, type Tool } from './editorStyle'

/** Un cuadro de TEXTO: display + edición inline (EditableBox) + handles. El padding
 *  transparente (compensado por el margen negativo) agranda el blanco clickeable
 *  SIN mover el texto; el pivote de rotación queda en la baseline-izquierda real. */
export function AnnotationTextBox({
  annotation: a,
  innerW,
  innerH,
  tool,
  selectedId,
  selected,
  editing,
  zoom = 1,
  readOnly = false,
  onStartDrag,
  onSelect,
  onStartEdit,
  onCommitText,
  onCancelEdit,
  onStartResize,
}: {
  annotation: TextAnnotation
  innerW: number
  innerH: number
  tool: Tool
  selectedId: string | null
  selected: boolean
  editing: boolean
  zoom?: number
  readOnly?: boolean
  onStartDrag: (e: ReactPointerEvent, a: TextAnnotation) => void
  onSelect: (e: ReactMouseEvent, id: string) => void
  onStartEdit: (id: string) => void
  onCommitText: (id: string, text: string) => void
  onCancelEdit: () => void
  onStartResize: (
    e: ReactPointerEvent,
    a: ResizableAnnotation,
    handle: ResizeHandle,
  ) => void
}) {
  const sz = a.sizeRatio * innerH
  const selectionStroke = 1.5 / Math.max(0.25, zoom)
  const hasBox = typeof a.wRatio === 'number' && typeof a.hRatio === 'number'
  const boxStyle: CSSProperties = {
    position: 'absolute',
    left: `${a.xRatio * 100}%`,
    top: `${a.yRatio * 100}%`,
    ...(typeof a.wRatio === 'number' ? { width: `${a.wRatio * 100}%` } : null),
    ...(typeof a.hRatio === 'number' ? { height: `${a.hRatio * 100}%` } : null),
    margin: `-${HIT_Y}px -${HIT_X}px`,
    padding: `${HIT_Y}px ${HIT_X}px`,
    fontFamily: previewFontFamily(a.font),
    fontWeight: a.bold ? 700 : 400,
    fontStyle: a.italic ? 'italic' : undefined,
    fontSize: `${sz}px`,
    lineHeight: TEXT_LINE_HEIGHT,
    color: a.color,
    opacity: a.opacity ?? 1,
    transform: a.rotation ? `rotate(${a.rotation}deg)` : undefined,
    transformOrigin: `${HIT_X}px ${HIT_Y + sz * baselineDropEm(a.font)}px`,
    whiteSpace: hasBox ? 'pre-wrap' : 'pre',
    overflow: hasBox ? 'hidden' : undefined,
    overflowWrap: 'break-word',
    borderRadius: 3,
  }
  if (editing) {
    return (
      <EditableBox
        initial={a.text}
        style={boxStyle}
        onCommit={(text) => onCommitText(a.id, text)}
        onCancel={onCancelEdit}
      />
    )
  }
  return (
    <div>
      <div
        onPointerDown={(e) => onStartDrag(e, a)}
        // Click selecciona ESTE (no llega al fondo, que deselecciona).
        onClick={(e) => onSelect(e, a.id)}
        // Doble clic edita el texto INLINE, sobre el cuadro.
        onDoubleClick={(e) => {
          e.stopPropagation()
          onStartEdit(a.id)
        }}
        title="Doble clic para editar · arrastra para mover"
        style={{
          ...boxStyle,
          cursor: a.locked ? 'default' : 'move',
          userSelect: 'none',
          touchAction: 'none',
          // Fuera de "seleccionar" no captura (deja dibujar encima).
          pointerEvents: !readOnly && tool === 'select' ? undefined : 'none',
          outlineWidth: selectionStroke,
          outlineStyle: 'solid',
          outlineColor: selected ? ACCENT : 'transparent',
          outlineOffset: 0,
          transition: 'outline-color 120ms ease',
        }}
      >
        {a.text || ' '}
      </div>
      <AnnotationResizeHandles
        annotation={a}
        innerW={innerW}
        innerH={innerH}
        selectedId={selectedId}
        tool={readOnly ? 'highlight' : tool}
        onStartResize={onStartResize}
        zoom={zoom}
      />
    </div>
  )
}
