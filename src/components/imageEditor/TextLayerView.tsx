import { useRef } from 'react'
import type { TextLayer } from '../../lib/imageEditor/types'
import { fontFamilyFor, fontWeightFor, textPx } from '../../lib/imageEditor/transforms'

const COLOR_CSS: Record<TextLayer['color'], string> = {
  ink: 'rgb(var(--ink-900))',
  paper: 'rgb(var(--paper-50))',
  accent: 'rgb(var(--accent-primary))',
}

/** Una capa de texto arrastrable sobre la caja de preview (coords normalizadas). */
export function TextLayerView({
  layer,
  boxW,
  boxH,
  selected,
  onSelect,
  onMove,
}: {
  layer: TextLayer
  boxW: number
  boxH: number
  selected: boolean
  onSelect: () => void
  onMove: (xN: number, yN: number) => void
}) {
  const drag = useRef<{
    startX: number
    startY: number
    startXN: number
    startYN: number
  } | null>(null)
  const { fontPx } = textPx(layer, boxW, boxH)
  // Halo de contraste opuesto al color (legibilidad sobre cualquier foto).
  const halo = layer.color === 'paper' ? COLOR_CSS.ink : COLOR_CSS.paper

  function begin(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    onSelect()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      startXN: layer.xN,
      startYN: layer.yN,
    }
  }
  function move(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const xN = d.startXN + (boxW > 0 ? (e.clientX - d.startX) / boxW : 0)
    const yN = d.startYN + (boxH > 0 ? (e.clientY - d.startY) / boxH : 0)
    onMove(Math.min(1, Math.max(0, xN)), Math.min(1, Math.max(0, yN)))
  }
  function end(e: React.PointerEvent) {
    drag.current = null
    try {
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Texto: ${layer.text || 'vacío'}`}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onClick={onSelect}
      className="absolute cursor-move select-none whitespace-pre leading-tight"
      style={{
        left: `${layer.xN * 100}%`,
        top: `${layer.yN * 100}%`,
        fontFamily: fontFamilyFor(layer.font),
        fontWeight: fontWeightFor(layer.bold),
        fontSize: `${fontPx}px`,
        color: COLOR_CSS[layer.color],
        textShadow: `0 0 ${Math.max(2, fontPx * 0.06)}px ${halo}, 0 1px 1px ${halo}`,
        outline: selected ? '1.5px dashed rgb(var(--accent-primary))' : 'none',
        outlineOffset: '2px',
        touchAction: 'none',
        maxWidth: '95%',
      }}
    >
      {layer.text || ' '}
    </div>
  )
}
