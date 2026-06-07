import {
  TEXT_LINE_HEIGHT,
  type HighlightAnnotation,
  type ImageAnnotation,
  type RedactionAnnotation,
  type ShapeAnnotation,
  type TextAnnotation,
} from '../../../lib/pdfStudio/model'
import type { ResizeHandle } from '../../../lib/pdfStudio/editorGeometry'
import type { Tool } from './editorStyle'

type ResizableAnnotation =
  | TextAnnotation
  | HighlightAnnotation
  | RedactionAnnotation
  | ImageAnnotation
  | ShapeAnnotation

type RatioBox = {
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
}

function boxForAnnotation(
  annotation: ResizableAnnotation,
  innerW: number,
  innerH: number,
): RatioBox {
  if (annotation.kind === 'shape') {
    return {
      xRatio: Math.min(annotation.x0Ratio, annotation.x1Ratio),
      yRatio: Math.min(annotation.y0Ratio, annotation.y1Ratio),
      wRatio: Math.abs(annotation.x1Ratio - annotation.x0Ratio),
      hRatio: Math.abs(annotation.y1Ratio - annotation.y0Ratio),
    }
  }
  if (annotation.kind === 'text') {
    const sz = annotation.sizeRatio * innerH
    const widthPx =
      typeof annotation.wRatio === 'number'
        ? annotation.wRatio * innerW
        : Math.max(sz * 1.6, (annotation.text || ' ').length * sz * 0.55)
    const heightPx =
      typeof annotation.hRatio === 'number'
        ? annotation.hRatio * innerH
        : sz * TEXT_LINE_HEIGHT
    return {
      xRatio: annotation.xRatio,
      yRatio: annotation.yRatio,
      wRatio: widthPx / Math.max(1, innerW),
      hRatio: heightPx / Math.max(1, innerH),
    }
  }
  return annotation
}

function labelPrefix(annotation: ResizableAnnotation): string {
  if (annotation.kind === 'image') return 'Redimensionar imagen desde'
  if (annotation.kind === 'redaction') return 'Redimensionar redacción desde'
  if (annotation.kind === 'highlight') return 'Redimensionar resaltado desde'
  if (annotation.kind === 'shape') return 'Redimensionar forma desde'
  return 'Redimensionar texto desde'
}

export function AnnotationResizeHandles({
  annotation,
  innerW,
  innerH,
  selectedId,
  tool,
  zoom = 1,
  onStartResize,
}: {
  annotation: ResizableAnnotation
  innerW: number
  innerH: number
  selectedId: string | null
  tool: Tool
  zoom?: number
  onStartResize: (
    e: React.PointerEvent,
    annotation: ResizableAnnotation,
    handle: ResizeHandle,
  ) => void
}) {
  if (tool !== 'select' || selectedId !== annotation.id || annotation.locked) return null
  const box = boxForAnnotation(annotation, innerW, innerH)
  const prefix = labelPrefix(annotation)
  const inverseZoom = 1 / Math.max(0.25, zoom)
  const handleSize = 14 * inverseZoom
  const handles: Array<{
    handle: ResizeHandle
    left: string
    top: string
    label: string
  }> = [
    {
      handle: 'nw',
      left: `${box.xRatio * 100}%`,
      top: `${box.yRatio * 100}%`,
      label: `${prefix} esquina superior izquierda`,
    },
    {
      handle: 'ne',
      left: `${(box.xRatio + box.wRatio) * 100}%`,
      top: `${box.yRatio * 100}%`,
      label: `${prefix} esquina superior derecha`,
    },
    {
      handle: 'sw',
      left: `${box.xRatio * 100}%`,
      top: `${(box.yRatio + box.hRatio) * 100}%`,
      label: `${prefix} esquina inferior izquierda`,
    },
    {
      handle: 'se',
      left: `${(box.xRatio + box.wRatio) * 100}%`,
      top: `${(box.yRatio + box.hRatio) * 100}%`,
      label: `${prefix} esquina inferior derecha`,
    },
  ]

  return (
    <>
      {handles.map(({ handle, left, top, label }) => (
        <button
          key={`${annotation.id}-${handle}`}
          type="button"
          aria-label={label}
          title={label}
          onPointerDown={(e) => onStartResize(e, annotation, handle)}
          className="absolute z-10 rounded-sm border border-paper-50 bg-[color:var(--accent-sage)] shadow-sm shadow-ink-900/25"
          style={{
            left,
            top,
            width: handleSize,
            height: handleSize,
            transform: 'translate(-50%, -50%)',
            cursor: handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize',
            touchAction: 'none',
          }}
        />
      ))}
    </>
  )
}
