import { rectFromPoints } from '../../../../lib/pdfStudio/model/editorGeometry'
import { ACCENT, HIGHLIGHT_OPACITY, hexToRgba } from './editorStyle'

type PreviewRect = { x0: number; y0: number; x1: number; y1: number }

export function HighlightDrawingPreview({
  rect,
  color,
}: {
  rect: PreviewRect
  color: string
}) {
  const r = rectFromPoints(rect.x0, rect.y0, rect.x1, rect.y1)
  return (
    <div
      style={{
        position: 'absolute',
        left: r.x,
        top: r.y,
        width: r.w,
        height: r.h,
        backgroundColor: hexToRgba(color, HIGHLIGHT_OPACITY),
        border: `1px dashed ${ACCENT}`,
        borderRadius: 2,
        pointerEvents: 'none',
      }}
    />
  )
}
