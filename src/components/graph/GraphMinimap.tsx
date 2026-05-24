import { useMemo, useRef } from 'react'
import type { Entity } from '../../types'
import { typeAccent } from './GraphNode'

/**
 * π2: GraphMinimap — thumbnail SVG en la esquina inferior izquierda del
 * GraphView que muestra todos los nodos como puntos del color de su tipo,
 * y un rectángulo del viewport actual.
 *
 * Click en cualquier punto del minimap pansa el grafo principal a esa
 * coordenada world (centro de pantalla).
 *
 * Solo se renderiza con >100 nodos — con pocas entidades el grafo entra
 * en pantalla y un minimap es chrome inútil.
 *
 * Implementación:
 *   - Computamos bounding box de todas las posiciones (min/maxX, min/maxY).
 *   - Escalamos al SIZE del minimap conservando aspect ratio.
 *   - El rectángulo del viewport se calcula desde (pan, zoom, viewportSize):
 *     centro mundo = -pan; ancho/alto visible = viewportSize / zoom.
 *
 * El minimap es estático (no se ajusta a viewport resize en tiempo real
 * — usa los dims del SVG host pasados como prop). Si el host cambia tamaño
 * el rect se re-mide al próximo render.
 */

const SIZE_W = 140
const SIZE_H = 100
const PADDING = 6

export function GraphMinimap({
  entities,
  positions,
  pan,
  zoom,
  hostWidth,
  hostHeight,
  onJumpTo,
}: {
  entities: Entity[]
  positions: Map<string, { x: number; y: number }>
  pan: { x: number; y: number }
  zoom: number
  hostWidth: number
  hostHeight: number
  /** Callback con coords world a las que panear. */
  onJumpTo: (worldX: number, worldY: number) => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)

  // Compute bounding box of all positions. Si no hay posiciones, fallback
  // a [-500, 500] cuadrado.
  const { minX, minY, scale } = useMemo(() => {
    if (positions.size === 0) {
      return { minX: -500, minY: -500, scale: (SIZE_W - 2 * PADDING) / 1000 }
    }
    let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity
    for (const p of positions.values()) {
      if (p.x < mnX) mnX = p.x
      if (p.y < mnY) mnY = p.y
      if (p.x > mxX) mxX = p.x
      if (p.y > mxY) mxY = p.y
    }
    // Padding interno alrededor del bbox para que los puntos no toquen el
    // borde del minimap.
    const w = Math.max(100, mxX - mnX)
    const h = Math.max(100, mxY - mnY)
    const sx = (SIZE_W - 2 * PADDING) / w
    const sy = (SIZE_H - 2 * PADDING) / h
    // Conservamos aspect ratio usando el menor de los dos scales.
    const s = Math.min(sx, sy)
    return { minX: mnX, minY: mnY, scale: s }
  }, [positions])

  // Mapear world (x, y) → minimap (px, py)
  function worldToMini(x: number, y: number): { px: number; py: number } {
    return {
      px: PADDING + (x - minX) * scale,
      py: PADDING + (y - minY) * scale,
    }
  }

  // Inversa: minimap (mx, my) → world (x, y). Usado al click.
  function miniToWorld(mx: number, my: number): { x: number; y: number } {
    return {
      x: (mx - PADDING) / scale + minX,
      y: (my - PADDING) / scale + minY,
    }
  }

  // Viewport rect en world coords: centro = -pan, ancho/alto = host/zoom.
  const viewportWorld = useMemo(() => {
    const w = hostWidth / zoom
    const h = hostHeight / zoom
    const cx = -pan.x
    const cy = -pan.y
    return { x: cx - w / 2, y: cy - h / 2, w, h }
  }, [pan, zoom, hostWidth, hostHeight])

  const vpTopLeft = worldToMini(viewportWorld.x, viewportWorld.y)
  const vpW = Math.max(2, viewportWorld.w * scale)
  const vpH = Math.max(2, viewportWorld.h * scale)

  function handleClick(event: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mx = event.clientX - rect.left
    const my = event.clientY - rect.top
    const world = miniToWorld(mx, my)
    onJumpTo(world.x, world.y)
  }

  return (
    <svg
      ref={svgRef}
      width={SIZE_W}
      height={SIZE_H}
      viewBox={`0 0 ${SIZE_W} ${SIZE_H}`}
      onClick={handleClick}
      role="img"
      aria-label="Minimap del grafo — click para navegar"
      style={{
        cursor: 'crosshair',
        backgroundColor: 'rgb(var(--paper-100) / 0.92)',
        border: '1px solid rgb(var(--ink-100))',
        borderRadius: 6,
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* Puntos del grafo. Cada uno coloreado por su typeAccent. */}
      {entities.map((e) => {
        const pos = positions.get(e.id)
        if (!pos) return null
        const { px, py } = worldToMini(pos.x, pos.y)
        return (
          <circle
            key={e.id}
            cx={px}
            cy={py}
            r={1.4}
            fill={typeAccent(e.type)}
            fillOpacity={0.75}
          />
        )
      })}

      {/* Rectángulo del viewport actual. Border accent-gold para que se
          distinga sobre los puntos. */}
      <rect
        x={vpTopLeft.px}
        y={vpTopLeft.py}
        width={vpW}
        height={vpH}
        fill="var(--accent-gold-soft)"
        stroke="var(--accent-gold)"
        strokeWidth={1.2}
        pointerEvents="none"
      />
    </svg>
  )
}
