import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import type { ImageAnnotation } from '../../../../lib/pdfStudio/model/model'
import type { ResizeHandle } from '../../../../lib/pdfStudio/model/editorGeometry'
import type { ResizableAnnotation } from './pdfAnnotationResize'
import { AnnotationResizeHandles } from './AnnotationResizeHandles'
import { ACCENT, type Tool } from './editorStyle'

/** Una IMAGEN estampada (firma/sello/logo): se mueve y redimensiona. En solo-lectura
 *  deja pasar los clics (no captura) para no tapar la capa de formularios. */
export function AnnotationImageBox({
  annotation: a,
  innerW,
  innerH,
  tool,
  selectedId,
  selected,
  zoom = 1,
  readOnly = false,
  onStartDrag,
  onSelect,
  onStartResize,
}: {
  annotation: ImageAnnotation
  innerW: number
  innerH: number
  tool: Tool
  selectedId: string | null
  selected: boolean
  zoom?: number
  readOnly?: boolean
  onStartDrag: (e: ReactPointerEvent, a: ImageAnnotation) => void
  onSelect: (e: ReactMouseEvent, id: string) => void
  onStartResize: (
    e: ReactPointerEvent,
    a: ResizableAnnotation,
    handle: ResizeHandle,
  ) => void
}) {
  const interactive = !readOnly && tool === 'select'
  const selectionStroke = 1.5 / Math.max(0.25, zoom)
  return (
    <div>
      <img
        src={a.src}
        alt="Imagen estampada"
        onPointerDown={interactive ? (e) => onStartDrag(e, a) : undefined}
        onClick={interactive ? (e) => onSelect(e, a.id) : undefined}
        title="Imagen estampada · arrastra para mover"
        style={{
          position: 'absolute',
          left: `${a.xRatio * 100}%`,
          top: `${a.yRatio * 100}%`,
          width: `${a.wRatio * 100}%`,
          height: `${a.hRatio * 100}%`,
          opacity: a.opacity ?? 1,
          objectFit: 'contain',
          cursor: a.locked ? 'default' : 'move',
          touchAction: 'none',
          userSelect: 'none',
          pointerEvents: interactive ? undefined : 'none',
          outlineWidth: selected ? selectionStroke : undefined,
          outlineStyle: selected ? 'solid' : undefined,
          outlineColor: selected ? ACCENT : undefined,
          outlineOffset: 2,
        }}
      />
      <AnnotationResizeHandles
        annotation={a}
        innerW={innerW}
        innerH={innerH}
        selectedId={readOnly ? null : selectedId}
        tool={readOnly ? 'highlight' : tool}
        onStartResize={onStartResize}
        zoom={zoom}
      />
    </div>
  )
}
