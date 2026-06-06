import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import type { HighlightAnnotation } from '../../../lib/pdfStudio/model'
import type { ResizeHandle } from '../../../lib/pdfStudio/editorGeometry'
import { AnnotationResizeHandles } from './AnnotationResizeHandles'
import { ACCENT, HIGHLIGHT_OPACITY, hexToRgba, type Tool } from './editorStyle'
import type { ResizableAnnotation } from './pdfAnnotationResize'

export function AnnotationHighlightBox({
  annotation,
  innerW,
  innerH,
  tool,
  selectedId,
  selected,
  onStartDrag,
  onSelect,
  onStartResize,
}: {
  annotation: HighlightAnnotation
  innerW: number
  innerH: number
  tool: Tool
  selectedId: string | null
  selected: boolean
  onStartDrag: (e: ReactPointerEvent, a: HighlightAnnotation) => void
  onSelect: (e: ReactMouseEvent, id: string) => void
  onStartResize: (
    e: ReactPointerEvent,
    annotation: ResizableAnnotation,
    handle: ResizeHandle,
  ) => void
}) {
  const interactive = tool === 'select'
  return (
    <div>
      <div
        onPointerDown={interactive ? (e) => onStartDrag(e, annotation) : undefined}
        onClick={interactive ? (e) => onSelect(e, annotation.id) : undefined}
        title="Arrastra para mover"
        style={{
          position: 'absolute',
          left: `${annotation.xRatio * 100}%`,
          top: `${annotation.yRatio * 100}%`,
          width: `${annotation.wRatio * 100}%`,
          height: `${annotation.hRatio * 100}%`,
          backgroundColor: hexToRgba(
            annotation.color,
            annotation.opacity ?? HIGHLIGHT_OPACITY,
          ),
          borderRadius: 2,
          cursor: annotation.locked ? 'default' : 'move',
          touchAction: 'none',
          pointerEvents: interactive ? undefined : 'none',
          outline: selected ? `1.5px solid ${ACCENT}` : 'none',
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
      />
    </div>
  )
}
