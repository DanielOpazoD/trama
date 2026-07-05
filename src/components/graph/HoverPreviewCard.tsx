import type { Entity } from '../../types'
import { ENTITY_TYPES } from '../../types'
import { typeAccent } from '../../lib/typeAccents'

/**
 * Card flotante que aparece al hover prolongado sobre un nodo del grafo
 * (~600ms de delay). Vive como `<g>` dentro del SVG del grafo: hereda
 * el sistema de coords del canvas, así el offsetX/offsetY se aplica
 * directamente en pixels relativos al nodo.
 *
 * Composición:
 *   - eyebrow editorial: tipo + año en italic serif
 *   - nombre: serif 14, truncado a 28 chars
 *   - stats: "N conexiones" debajo
 *   - descripción truncada (si existe)
 *
 * Las CSS vars (--bg-card, --ink, --ink-dim) garantizan que se ve bien
 * en light / dark / vela sin trabajo extra.
 */
export function HoverPreviewCard({
  entity,
  posX,
  posY,
  connectionCount,
}: {
  entity: Entity
  posX: number
  posY: number
  connectionCount: number
}) {
  const typeLabel =
    ENTITY_TYPES.find((t) => t.value === entity.type)?.label ?? entity.type
  const cardW = 200
  const cardH = entity.year ? 76 : 60
  // Mostrar a la derecha del nodo con offset constante.
  const offsetX = 28
  const offsetY = -cardH / 2

  return (
    <g
      transform={`translate(${posX + offsetX} ${posY + offsetY})`}
      style={{ pointerEvents: 'none' }}
      className="animate-fade-up"
    >
      <rect
        width={cardW}
        height={cardH}
        rx={8}
        ry={8}
        fill="var(--bg-card)"
        fillOpacity={0.98}
        stroke="var(--border-subtle)"
        strokeWidth={1}
      />
      {/* ω-firma: disco del acento del tipo — misma ancla cromática que la
          leyenda, para leer el tipo de un vistazo. */}
      <circle
        cx={13}
        cy={14.5}
        r={2.5}
        fill={typeAccent(entity.type)}
        fillOpacity={0.9}
      />
      <text
        x={22}
        y={18}
        fontSize={9}
        fill="var(--ink-dim)"
        fontFamily="Spectral, Iowan Old Style, Palatino, Georgia, serif"
        fontStyle="italic"
        style={{ userSelect: 'none' }}
      >
        {typeLabel.toLowerCase()}
        {entity.year && <> · {entity.year}</>}
      </text>
      <text
        x={22}
        y={38}
        fontSize={14}
        fontWeight={500}
        fill="var(--ink)"
        fontFamily="Spectral, Iowan Old Style, Palatino, Georgia, serif"
        style={{ userSelect: 'none' }}
      >
        {entity.name.length > 28 ? entity.name.slice(0, 27) + '…' : entity.name}
      </text>
      <text
        x={22}
        y={entity.year ? 60 : 54}
        fontSize={10}
        fill="var(--ink-dim)"
        style={{ userSelect: 'none', letterSpacing: '0.05em' }}
      >
        {connectionCount} {connectionCount === 1 ? 'conexión' : 'conexiones'}
      </text>
      {entity.description && (
        <text
          x={22}
          y={entity.year ? 72 : 66}
          fontSize={9.5}
          fill="var(--ink-dim)"
          fontStyle="italic"
          fontFamily="Spectral, Iowan Old Style, Palatino, Georgia, serif"
          style={{ userSelect: 'none' }}
        >
          {entity.description.length > 40
            ? entity.description.slice(0, 39) + '…'
            : entity.description}
        </text>
      )}
    </g>
  )
}
