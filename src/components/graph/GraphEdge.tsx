import { useState } from 'react'
import { RELATIONSHIP_TYPES, type Relationship } from '../../types'
import type { LayoutMode } from '../../hooks/layouts/types'

type Point = { x: number; y: number }

/**
 * λ9: cada tipo de relación tiene su propia firma cromática. Antes todos
 * los edges eran gris uniforme (ink-2), lo que hacía que el grafo se viera
 * técnico — un diagrama de aristas sin semántica visual. Ahora la dirección
 * del color insinúa el contenido del vínculo:
 *
 *   influye_en    → primary (azul prusia, el vínculo intelectual canónico)
 *   cita_a        → gold    (la cita literal trae la marca cálida de la cita)
 *   responde_a    → primary (diálogo intelectual, mismo registro que influye)
 *   me_llego_por  → sage    (vegetal, "por dónde te llegó")
 *   suena_como    → musico  (rojo-tierra de la afinidad sonora)
 *   inspira       → gold    (la inspiración es luz cálida)
 *   contradice    → clay    (rojo nítido del disenso)
 *   asociado_con  → sage    (el más laxo, vegetal neutral)
 *
 * Las propuestas IA mantienen su tinte primary distinguible (igual que
 * antes el sky-700) — sigue siendo importante saber "esto lo propuso la IA"
 * aunque la relación sea de un tipo cálido.
 */
export function relTypeAccent(type: string): string {
  switch (type) {
    case 'influye_en':
    case 'responde_a':
      return 'var(--accent-primary)'
    case 'cita_a':
    case 'inspira':
      return 'var(--accent-gold)'
    case 'me_llego_por':
    case 'asociado_con':
      return 'var(--accent-sage)'
    case 'suena_como':
      return 'var(--type-musico)'
    case 'contradice':
      return 'var(--accent-clay)'
    default:
      return 'var(--ink-2)'
  }
}

/**
 * Compute a quadratic Bezier path between two points with a perpendicular
 * curvature. The control point sits off the midpoint, perpendicular to the
 * line, by `curvature * length`. Same-direction siblings between two nodes
 * naturally fan out instead of overlapping.
 */
function curvedPath(from: Point, to: Point, curvature = 0.18): {
  d: string
  midX: number
  midY: number
} {
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.sqrt(dx * dx + dy * dy) || 1
  // Perpendicular unit vector
  const nx = -dy / length
  const ny = dx / length
  const controlX = midX + nx * length * curvature
  const controlY = midY + ny * length * curvature
  return {
    d: `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`,
    midX: controlX,
    midY: controlY,
  }
}

/**
 * Shrink the endpoints so the line stops at the node circumference instead of
 * the center. Uses a fixed `nodePad` since true radius isn't known here.
 */
function trimEndpoints(from: Point, to: Point, fromPad = 12, toPad = 14): {
  from: Point
  to: Point
} {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.sqrt(dx * dx + dy * dy) || 1
  return {
    from: { x: from.x + (dx / length) * fromPad, y: from.y + (dy / length) * fromPad },
    to: { x: to.x - (dx / length) * toPad, y: to.y - (dy / length) * toPad },
  }
}

export function GraphEdge({
  rel,
  from,
  to,
  highlighted,
  dimmed,
  fresh = false,
  layoutMode,
}: {
  rel: Relationship
  from: Point | undefined
  to: Point | undefined
  highlighted: boolean
  dimmed: boolean
  fresh?: boolean
  /** ζ1: el modo de layout decide si curvamos o no. En 'by-year' las
      conexiones cruzan una línea de tiempo donde la dirección horizontal
      es semántica; curvar rompe esa intuición. En el resto curvamos
      sutilmente porque las líneas rectas se ven "técnicas". */
  layoutMode?: LayoutMode
}) {
  // ζ2: hover-on-edge state local. Cuando el cursor está sobre el edge
  // (su hit area expandida), mostramos el label aún si no está highlighted.
  // highlighted (selección de nodo conectado) gana sobre hover (el highlight
  // ya implica mostrar label además de animar dash).
  const [hovered, setHovered] = useState(false)

  if (!from || !to) return null
  const trimmed = trimEndpoints(from, to)
  // En by-year usamos rectas (curvature 0). En el resto, bezier sutil.
  // ζ1: bajado de 0.18 a 0.12 — la curva era un poco aspaventosa en
  // distancias largas. 12% queda elegante sin ser histriónico.
  const curvature = layoutMode === 'by-year' ? 0 : 0.12
  const { d, midX, midY } = curvedPath(trimmed.from, trimmed.to, curvature)

  const isAi = rel.origin.kind === 'ai'
  // λ9: stroke por tipo de relación. Si es propuesta IA, mantenemos el
  // tinte azul claro distintivo (preserva el patrón de "ojo a la propuesta")
  // sobre el color del tipo — la procedencia importa visualmente más que
  // el contenido. Para relaciones manuales/imported, el color cuenta el tipo.
  const stroke = isAi ? '#7AA7C7' : relTypeAccent(rel.type)
  const opacity = dimmed ? 0.08 : highlighted ? 0.85 : hovered ? 0.6 : 0.32
  const strokeWidth = highlighted ? 1.6 : hovered ? 1.4 : 1.1
  const typeLabel =
    RELATIONSHIP_TYPES.find((t) => t.value === rel.type)?.label ??
    rel.type.replace(/_/g, ' ')
  const markerId = isAi ? 'edgeArrowAi' : 'edgeArrow'
  const showLabel = highlighted || hovered

  return (
    <g style={{ ['--final-opacity' as never]: opacity }} className={fresh ? 'animate-edge-in' : undefined}>
      {/* Visible stroke — sin pointer events para que no robe focus al
          hit area transparente de abajo. */}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeOpacity={opacity}
        strokeLinecap="round"
        markerEnd={`url(#${markerId})`}
        className={highlighted ? 'animate-dash-flow' : undefined}
        style={{ pointerEvents: 'none', transition: 'stroke-width 200ms ease, stroke-opacity 200ms ease' }}
      />
      {/* ζ2: hit area transparente más gruesa (8x) para que el hover sea
          cazable aún en edges finos. pointer-events=stroke = solo activa
          en el trazo (no en el fill interior). */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ pointerEvents: 'stroke', cursor: 'help' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      {showLabel && (
        <g style={{ pointerEvents: 'none' }}>
          {/* ζ2: backplate con border sutil — antes era solo fill con
              opacidad 0.92; ahora le ponemos un border de 0.5 al --ink-100
              para que se sienta como una etiqueta de catálogo, no como
              un sticker. */}
          <rect
            x={midX - typeLabel.length * 3 - 7}
            y={midY - 7.5}
            width={typeLabel.length * 6 + 14}
            height={15}
            rx={7.5}
            ry={7.5}
            fill="var(--bg-card)"
            fillOpacity={0.95}
            stroke="var(--border-subtle)"
            strokeWidth={0.5}
          />
          <text
            x={midX}
            y={midY + 3}
            fontSize={9.5}
            fill="var(--ink)"
            textAnchor="middle"
            style={{ userSelect: 'none', letterSpacing: '0.05em' }}
          >
            {typeLabel}
          </text>
        </g>
      )}
    </g>
  )
}
