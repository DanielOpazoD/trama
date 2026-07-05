import { useMemo, useState } from 'react'
import type { Entity } from '../../types'
import { typeAccent } from '../../lib/typeAccents'

/**
 * Leyenda de tipos del grafo — qué color es qué voz, con su count.
 * Plegada por default (un botón discreto «leyenda»); al abrir, lista
 * los tipos presentes ordenados por presencia, cap a 8 + «y N más».
 * Display-only: la leyenda informa, no filtra (el filtro vive en
 * Entidades; duplicarlo acá sería un segundo estado de verdad).
 */

const MAX_TYPES = 8

export function buildTypeLegend(entities: Entity[]): { type: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const e of entities) counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
}

export function GraphTypeLegend({
  entities,
  onHoverType,
}: {
  entities: Entity[]
  /** ω-leyenda: al pasar el cursor por un tipo, avisa cuál — el grafo
   *  enciende esos nodos. `null` al salir o cerrar. */
  onHoverType?: (type: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const legend = useMemo(() => buildTypeLegend(entities), [entities])
  if (legend.length < 2) return null
  const visible = legend.slice(0, MAX_TYPES)
  const rest = legend.length - visible.length

  return (
    <div className="absolute bottom-4 left-4 z-10 flex flex-col items-start gap-1.5">
      {open && (
        <ul
          aria-label="Leyenda de tipos"
          onMouseLeave={() => onHoverType?.(null)}
          className="space-y-0.5 rounded-lg border border-ink-100/70 bg-paper-50/90 px-2 py-1.5 shadow-sm shadow-ink-900/10 backdrop-blur-sm"
        >
          {visible.map(({ type, count }) => (
            <li
              key={type}
              onMouseEnter={() => onHoverType?.(type)}
              className="flex cursor-default items-center gap-2 rounded px-1.5 py-0.5 text-caption text-ink-600 transition-colors hover:bg-ink-100/50"
            >
              <span
                aria-hidden
                className="size-2.5 rounded-full ring-1 ring-inset ring-black/5"
                style={{ backgroundColor: typeAccent(type) }}
              />
              <span className="font-serif">{type}</span>
              <span className="ml-auto pl-3 text-micro tabular-nums text-ink-300">
                {count}
              </span>
            </li>
          ))}
          {rest > 0 && (
            <li className="px-1.5 pt-0.5 text-micro italic font-serif text-ink-300">
              y {rest} más
            </li>
          )}
        </ul>
      )}
      <button
        onClick={() =>
          setOpen((o) => {
            // Al cerrar, apaga cualquier realce que quedara activo.
            if (o) onHoverType?.(null)
            return !o
          })
        }
        aria-expanded={open}
        className="rounded-full border border-ink-100/70 bg-paper-50/90 px-2.5 py-1 text-micro uppercase tracking-eyebrow text-ink-400 shadow-sm backdrop-blur-sm transition-colors hover:text-ink-700"
      >
        {open ? 'cerrar' : 'leyenda'}
      </button>
    </div>
  )
}
