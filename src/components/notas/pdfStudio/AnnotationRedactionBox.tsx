import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import type { RedactionAnnotation } from '../../../lib/pdfStudio/model'
import type { ResizeHandle } from '../../../lib/pdfStudio/editorGeometry'
import { AnnotationResizeHandles } from './AnnotationResizeHandles'
import { ACCENT, type Tool } from './editorStyle'
import type { ResizableAnnotation } from './pdfAnnotationResize'

export function AnnotationRedactionBox({
  annotation,
  innerW,
  innerH,
  tool,
  selectedId,
  selected,
  zoom = 1,
  onStartDrag,
  onSelect,
  onStartResize,
}: {
  annotation: RedactionAnnotation
  innerW: number
  innerH: number
  tool: Tool
  selectedId: string | null
  selected: boolean
  zoom?: number
  onStartDrag: (e: ReactPointerEvent, a: RedactionAnnotation) => void
  onSelect: (e: ReactMouseEvent, id: string) => void
  onStartResize: (
    e: ReactPointerEvent,
    annotation: ResizableAnnotation,
    handle: ResizeHandle,
  ) => void
}) {
  const interactive = tool === 'select'
  const selectionStroke = 1.5 / Math.max(0.25, zoom)
  return (
    <div>
      <div
        onPointerDown={interactive ? (e) => onStartDrag(e, annotation) : undefined}
        onClick={interactive ? (e) => onSelect(e, annotation.id) : undefined}
        title="Redacción segura pendiente"
        style={{
          position: 'absolute',
          left: `${annotation.xRatio * 100}%`,
          top: `${annotation.yRatio * 100}%`,
          width: `${annotation.wRatio * 100}%`,
          height: `${annotation.hRatio * 100}%`,
          backgroundColor: annotation.color,
          borderRadius: 2,
          cursor: annotation.locked ? 'default' : 'move',
          touchAction: 'none',
          pointerEvents: interactive ? undefined : 'none',
          outlineWidth: selected ? selectionStroke : undefined,
          outlineStyle: selected ? 'solid' : undefined,
          outlineColor: selected ? ACCENT : undefined,
          outlineOffset: 1,
        }}
      />
      <AnnotationResizeHandles
        annotation={annotation}
        innerW={innerW}
        innerH={innerH}
        selectedId={selectedId}
        tool={tool}
        onStartResize={onStartResize}
        zoom={zoom}
      />
    </div>
  )
}
