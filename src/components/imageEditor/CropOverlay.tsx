import { useRef } from 'react'
import type { CropRect } from '../../lib/imageEditor/types'
import { type CropHandle, moveCrop, resizeCrop } from '../../lib/imageEditor/transforms'

/** Los 8 handles con su posición sobre el borde del rectángulo + cursor. */
const HANDLES: { h: CropHandle; pos: string; cursor: string }[] = [
  {
    h: 'nw',
    pos: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2',
    cursor: 'nwse-resize',
  },
  {
    h: 'n',
    pos: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2',
    cursor: 'ns-resize',
  },
  {
    h: 'ne',
    pos: 'right-0 top-0 translate-x-1/2 -translate-y-1/2',
    cursor: 'nesw-resize',
  },
  {
    h: 'e',
    pos: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
    cursor: 'ew-resize',
  },
  {
    h: 'se',
    pos: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2',
    cursor: 'nwse-resize',
  },
  {
    h: 's',
    pos: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2',
    cursor: 'ns-resize',
  },
  {
    h: 'sw',
    pos: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2',
    cursor: 'nesw-resize',
  },
  {
    h: 'w',
    pos: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
    cursor: 'ew-resize',
  },
]

type Drag = {
  kind: 'move' | CropHandle
  startX: number
  startY: number
  startCrop: CropRect
}

/** Rectángulo de recorte arrastrable/redimensionable sobre la caja de preview. */
export function CropOverlay({
  crop,
  boxW,
  boxH,
  onChange,
}: {
  crop: CropRect
  boxW: number
  boxH: number
  onChange: (c: CropRect) => void
}) {
  const drag = useRef<Drag | null>(null)

  function begin(kind: Drag['kind'], e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    drag.current = { kind, startX: e.clientX, startY: e.clientY, startCrop: crop }
  }
  function move(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const dxN = boxW > 0 ? (e.clientX - d.startX) / boxW : 0
    const dyN = boxH > 0 ? (e.clientY - d.startY) / boxH : 0
    onChange(
      d.kind === 'move'
        ? moveCrop(d.startCrop, dxN, dyN)
        : resizeCrop(d.startCrop, d.kind, dxN, dyN),
    )
  }
  function end(e: React.PointerEvent) {
    drag.current = null
    try {
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }
  function nudge(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 0.05 : 0.01
    const map: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const delta = map[e.key]
    if (!delta) return
    e.preventDefault()
    onChange(moveCrop(crop, delta[0], delta[1]))
  }

  return (
    <div
      className="absolute inset-0 rounded-md"
      style={{ touchAction: 'none' }}
      aria-hidden={false}
    >
      <div
        role="group"
        aria-label="Área de recorte (flechas para mover)"
        tabIndex={0}
        onPointerDown={(e) => begin('move', e)}
        onPointerMove={move}
        onPointerUp={end}
        onKeyDown={nudge}
        className="absolute cursor-move focus:outline focus:outline-2 focus:outline-offset-1"
        style={{
          left: `${crop.xN * 100}%`,
          top: `${crop.yN * 100}%`,
          width: `${crop.wN * 100}%`,
          height: `${crop.hN * 100}%`,
          border: '1.5px solid rgb(var(--accent-primary))',
          boxShadow: '0 0 0 9999px rgba(10,10,12,0.45)',
        }}
      >
        {HANDLES.map(({ h, pos, cursor }) => (
          <button
            key={h}
            type="button"
            aria-label={`Ajustar borde ${h}`}
            onPointerDown={(e) => begin(h, e)}
            onPointerMove={move}
            onPointerUp={end}
            className={`absolute ${pos} size-3.5 rounded-full border border-ink-700 bg-paper-50`}
            style={{ cursor, touchAction: 'none' }}
          />
        ))}
      </div>
    </div>
  )
}
