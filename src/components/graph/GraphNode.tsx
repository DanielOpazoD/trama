import { memo } from 'react'
import { ENTITY_TYPES, type Entity } from '../../types'
// Q1: typeAccent vive en `src/lib/typeAccents.ts`. Re-exportado acá por
// compat (varios call sites lo importaban desde este archivo).
import { typeAccent } from '../../lib/typeAccents'

export { typeAccent }

const NODE_TRUNCATE = 24

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

/** Stable per-id pseudo-random in [0, 1) — same id always returns same value. */
function hashToUnit(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return (h % 10_000) / 10_000
}

function GraphNodeInternal({
  entity,
  x,
  y,
  isSelected,
  isFocused = false,
  isDimmed,
  isFresh = false,
  connectionCount,
  onMouseDown,
  onClick,
  onHoverStart,
  onHoverEnd,
}: {
  entity: Entity
  x: number
  y: number
  isSelected: boolean
  isFocused?: boolean
  isDimmed: boolean
  isFresh?: boolean
  connectionCount: number
  onMouseDown: (event: React.MouseEvent) => void
  onClick: (event: React.MouseEvent) => void
  /** ζ5: callbacks de hover usados por GraphView para mostrar la preview
      card después de un delay. El delay lo maneja el parent (acá solo
      emitimos enter/leave). */
  onHoverStart?: () => void
  onHoverEnd?: () => void
}) {
  const accent = typeAccent(entity.type)
  const radius = Math.min(9 + Math.sqrt(connectionCount) * 4.5, 28)
  const opacity = isDimmed ? 0.28 : 1
  const typeLabel = ENTITY_TYPES.find((t) => t.value === entity.type)?.label
  const labelY = radius + 14
  const typeLabelY = labelY + 10

  // ζ8: inicial editorial dentro del nodo. Antes el centro era un disco hueco
  // (cuerpo paper + dot de acento al 14%) que leía como "imagen faltante". La
  // capital serif lo convierte en una entrada de índice impreso / capitular
  // iluminada — y de paso permite distinguir entidades de un vistazo sin leer el
  // label de abajo. Va en `--ink` (no en el acento) para garantizar contraste en
  // los tres temas; el color de tipo se queda en el anillo. Escala con el radio
  // pero acotada para que ni se pierda en nodos chicos ni domine en los grandes.
  const initial = (Array.from(entity.name.trim())[0] ?? '·').toUpperCase()
  const initialSize = Math.round(Math.min(Math.max(radius * 1.05, 11), 26))

  const ringStroke = isSelected ? 'var(--ink)' : isFocused ? 'var(--ink-2)' : accent
  const ringWidth = isSelected ? 2.2 : isFocused ? 2 : 1.4
  const ringOpacity = isSelected || isFocused ? 0.95 : 0.75
  const ringDash = isFocused && !isSelected ? '4 2' : undefined

  // Ambient drift: stable random phase per entity so the graph breathes
  // without all nodes moving in unison.
  const driftDelay = `${-(hashToUnit(entity.id) * 14)}s`
  // δ6: breathe offset — independiente del drift para que dos nodos
  // no estén en la misma fase ni de uno ni de otro. Resultado: el
  // grafo entero pulsa pero como sutiles olas, no como un reloj.
  const breatheOffset = `${-(hashToUnit(entity.id + 'breathe') * 4.2)}s`

  return (
    <g
      id={`graph-node-${entity.id}`}
      role="button"
      aria-label={`${entity.name}, ${typeLabel}${
        connectionCount > 0 ? `, ${connectionCount} conexiones` : ''
      }${isSelected ? ', seleccionado' : ''}`}
      transform={`translate(${x} ${y})`}
      className={`graph-node ${isFresh ? 'animate-node-in' : ''}`}
      style={{
        cursor: 'grab',
        opacity,
        transition: 'opacity 200ms ease',
      }}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      {/* Inner group applies ambient drift; outer stays at the layout position
          so dragging and force-layout still work normally. δ6: anidamos
          un segundo wrapper para combinar drift (translate) + breathe
          (opacity + scale). Si los pusiéramos en el mismo elemento, la
          última declaración de animation ganaría. */}
      <g
        className={isSelected ? undefined : 'animate-node-drift'}
        style={{ animationDelay: driftDelay }}
      >
        <g
          className={isSelected ? undefined : 'animate-node-breathe'}
          style={{ '--breathe-offset': breatheOffset } as React.CSSProperties}
        >
          {/* ζ4: Selection halo refinado — antes era un círculo grueso
            (strokeWidth 6) que se sentía pesado. Ahora un anillo fino
            con ticks radiales tipo marca de hora de un reloj. Sutil
            pero claramente "esto está seleccionado". */}
          {isSelected && (
            <g className="animate-halo-pulse">
              {/* Anillo interior fino */}
              <circle
                cx={0}
                cy={0}
                r={radius + 4}
                fill="none"
                stroke="var(--ink)"
                strokeWidth={1.2}
                strokeOpacity={0.7}
              />
              {/* Ticks radiales — 8 marcas a 45° de separación, como las
                horas de un reloj. Cada tick es una línea corta del
                radius+6 al radius+10. Las cardinales (0, 90, 180, 270)
                son ligeramente más largas para sugerir "norte". */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
                const rad = (angle * Math.PI) / 180
                const isCardinal = angle % 90 === 0
                const inner = radius + 6
                const outer = radius + (isCardinal ? 12 : 9)
                return (
                  <line
                    key={angle}
                    x1={Math.cos(rad) * inner}
                    y1={Math.sin(rad) * inner}
                    x2={Math.cos(rad) * outer}
                    y2={Math.sin(rad) * outer}
                    stroke="var(--ink)"
                    strokeWidth={1.2}
                    strokeOpacity={isCardinal ? 0.8 : 0.5}
                    strokeLinecap="round"
                  />
                )
              })}
            </g>
          )}
          {/* Node body */}
          <circle
            cx={0}
            cy={0}
            r={radius}
            fill="var(--bg-card)"
            stroke={ringStroke}
            strokeOpacity={ringOpacity}
            strokeWidth={ringWidth}
            strokeDasharray={ringDash}
          />
          {/* Inner accent dot */}
          <circle
            cx={0}
            cy={0}
            r={Math.max(radius - 7, 2)}
            fill={accent}
            fillOpacity={0.14}
          />
          {/* ζ8: capital iluminada — inicial serif centrada en el nodo */}
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={initialSize}
            fontWeight={500}
            fill="var(--ink)"
            fillOpacity={0.82}
            fontFamily="Spectral, Iowan Old Style, Palatino, Georgia, serif"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {initial}
          </text>
          {/* AI provenance pip */}
          {entity.origin.kind === 'ai' && (
            <circle
              cx={radius * 0.7}
              cy={-radius * 0.7}
              r={2.5}
              fill="#7AA7C7"
              stroke="var(--bg-card)"
              strokeWidth={1.5}
            />
          )}
          {/* ζ3: Name en Spectral serif (era sans). Los nodos del grafo
            ahora se ven como entradas de un índice impreso, no como
            tags de un dashboard. fontWeight 400 (regular) porque el
            serif a 12px con 500 se ve apretado; en regular respira. */}
          <text
            y={labelY}
            textAnchor="middle"
            fontSize={12.5}
            fontWeight={400}
            fill="var(--ink)"
            fontFamily="Spectral, Iowan Old Style, Palatino, Georgia, serif"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {truncate(entity.name, NODE_TRUNCATE)}
          </text>
          {/* Type */}
          <text
            y={typeLabelY}
            textAnchor="middle"
            fontSize={8.5}
            fill="var(--ink-dim)"
            letterSpacing="1.4"
            style={{
              userSelect: 'none',
              pointerEvents: 'none',
              textTransform: 'uppercase',
            }}
          >
            {typeLabel}
          </text>
        </g>
      </g>
    </g>
  )
}

/**
 * N5: `React.memo` con comparator custom para evitar re-renders en listas
 * grandes de nodos. Comparamos solo los datos visuales (entity, posición,
 * estado de selección/foco/dim/fresh, connectionCount). IGNORAMOS las
 * callbacks porque el padre las crea inline en cada iteración del map
 * — si las comparáramos, el shallow compare default vería diferencia
 * SIEMPRE y memo no serviría.
 *
 * Trade-off: si el padre cambia la semántica de las callbacks pero NO
 * cambian los datos visuales, los nodos no van a recibir la update
 * inmediato. Aceptable acá porque las callbacks de GraphView solo
 * interactúan con state que viene en otras props (selectedId, etc.).
 *
 * Impacto: con 200 nodos y un cambio de pan/zoom (que NO toca props de
 * nodo), el re-render skip ahorra ~10-20ms en mid-end laptops.
 */
export const GraphNode = memo(GraphNodeInternal, (prev, next) => {
  return (
    prev.entity === next.entity &&
    prev.x === next.x &&
    prev.y === next.y &&
    prev.isSelected === next.isSelected &&
    prev.isFocused === next.isFocused &&
    prev.isDimmed === next.isDimmed &&
    prev.isFresh === next.isFresh &&
    prev.connectionCount === next.connectionCount
  )
})
