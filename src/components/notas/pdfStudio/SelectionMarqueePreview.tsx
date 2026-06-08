import { rectFromPoints } from '../../../lib/pdfStudio/model/editorGeometry'
import { ACCENT } from './editorStyle'

type MarqueeRect = { x0: number; y0: number; x1: number; y1: number }

export function SelectionMarqueePreview({ rect }: { rect: MarqueeRect }) {
  const r = rectFromPoints(rect.x0, rect.y0, rect.x1, rect.y1)
  return (
    <div
      aria-hidden="true"
      data-pdf-selection-marquee="true"
      style={{
        position: 'absolute',
        left: r.x,
        top: r.y,
        width: r.w,
        height: r.h,
        backgroundColor: 'color-mix(in srgb, var(--accent-sage) 10%, transparent)',
        border: `1px solid ${ACCENT}`,
        borderRadius: 2,
        pointerEvents: 'none',
      }}
    />
  )
}
