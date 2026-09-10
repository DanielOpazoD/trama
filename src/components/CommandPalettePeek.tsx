import type { CommandSearchEntity } from '../hooks/commandSearchModel'
import type { Item } from '../hooks/useCommandSearch'
import { ENTITY_TYPES } from '../types'
import { MONTH_NAMES } from './CommandPaletteItems'
import { EntitySigil } from './EntitySigil'

/**
 * Ola transversal 2026-06: la ficha del resultado resaltado. Convierte el
 * palette en un visor — ↑↓ hojea entidades, citas o momentos sin abrirlos.
 * Cada kind compone con su registro: la entidad como ficha de catálogo (sigil
 * + small caps), la cita como quote serif, lo demás sobrio.
 *
 * Viaja en su propio chunk: lo monta `commandPalette/CommandPalettePeekSlot.tsx`.
 */
export function PeekPanel({
  item,
  entities,
}: {
  item: Item
  entities: CommandSearchEntity[] | undefined
}) {
  if (item.kind === 'entity') {
    const full = entities?.find((e) => e.id === item.id)
    const typeLabel = ENTITY_TYPES.find((t) => t.value === item.type)?.label ?? item.type
    return (
      <div className="p-4 stack-2">
        <EntitySigil name={item.name} type={item.type} size="lg" />
        <p className="font-serif text-h2 text-ink-800 leading-tight">{item.name}</p>
        <p className="text-micro uppercase tracking-eyebrow text-ink-400">
          {typeLabel}
          {full?.year ? ` · ${full.year}` : ''}
        </p>
        {full?.description && (
          <p className="text-caption text-ink-500 leading-relaxed line-clamp-6">
            {full.description}
          </p>
        )}
        <p className="text-micro text-ink-300 pt-1">enter abre su ficha completa</p>
      </div>
    )
  }
  if (item.kind === 'quote') {
    return (
      <div className="p-4 stack-2">
        <p className="quote-block font-serif italic text-body text-ink-700 leading-relaxed">
          «{item.text}»
        </p>
        <p className="text-caption text-ink-400">— {item.entityName}</p>
        <p className="text-micro text-ink-300 pt-1">enter abre la entidad de la cita</p>
      </div>
    )
  }
  if (item.kind === 'momento') {
    return (
      <div className="p-4 stack-2">
        <p className="text-micro uppercase tracking-eyebrow text-ink-400">
          momento · {item.momentoKind}
        </p>
        <p className="text-caption text-ink-600 leading-relaxed line-clamp-[8]">
          {item.text}
        </p>
      </div>
    )
  }
  if (item.kind === 'cronica') {
    return (
      <div className="p-4 stack-2">
        <p className="text-micro uppercase tracking-eyebrow text-ink-400">
          crónica · {MONTH_NAMES[item.month - 1]} {item.year}
        </p>
        <p className="font-serif italic text-caption text-ink-600 leading-relaxed line-clamp-[8]">
          {item.text}
        </p>
      </div>
    )
  }
  if (item.kind === 'chat') {
    return (
      <div className="p-4 stack-2">
        <p className="text-micro uppercase tracking-eyebrow text-ink-400">
          {item.threadTitle ?? 'conversación'}
        </p>
        <p className="text-caption text-ink-600 leading-relaxed line-clamp-[8]">
          {item.text}
        </p>
      </div>
    )
  }
  if (item.kind === 'content') {
    return (
      <div className="p-4 stack-2">
        <p className="text-micro uppercase tracking-eyebrow text-ink-400">
          {item.hint ?? item.section}
        </p>
        <p className="text-caption text-ink-600 leading-relaxed line-clamp-[8] whitespace-pre-line">
          {item.preview ?? item.label}
        </p>
        <p className="text-micro text-ink-300 pt-1">
          enter abre la sección
          {item.secondary ? ` · ⇧ enter ${item.secondary.label}` : ''}
        </p>
      </div>
    )
  }
  if (item.kind === 'savedQuery') {
    return (
      <div className="p-4 stack-2">
        <p className="text-micro uppercase tracking-eyebrow text-ink-400">
          consulta guardada
        </p>
        <p className="font-serif text-h2 text-ink-800 leading-tight">{item.name}</p>
        <p className="text-micro text-ink-300 pt-1">enter ejecuta la consulta</p>
      </div>
    )
  }
  if (item.kind === 'ask') {
    return (
      <div className="p-4 stack-2">
        <p className="text-micro uppercase tracking-eyebrow text-ink-400">
          preguntar a tu trama
        </p>
        <p className="font-serif italic text-body text-ink-700 leading-relaxed">
          «{item.q}»
        </p>
        <p className="text-caption text-ink-500 leading-relaxed">
          La IA interpreta tu pregunta como una consulta (tipos, fechas, etiquetas) y
          responde con resultados de toda tu trama.
        </p>
        <p className="text-micro text-ink-300 pt-1">enter interpreta y busca</p>
      </div>
    )
  }
  return (
    <div className="p-4 stack-2">
      <p className="font-serif text-lead text-ink-700">{item.label}</p>
      {item.hint && (
        <p className="text-caption text-ink-400 leading-relaxed">{item.hint}</p>
      )}
      <p className="text-micro text-ink-300 pt-1">
        {item.kind === 'action' ? 'enter ejecuta la acción' : 'enter te lleva ahí'}
      </p>
    </div>
  )
}
