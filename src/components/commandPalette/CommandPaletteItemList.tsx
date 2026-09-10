import type { CommandSearchContentItem } from '../../hooks/commandSearchModel'
import type { Item } from '../../hooks/useCommandSearch'
import { ItemRow } from '../CommandPaletteItems'
import {
  commandPaletteItemKey,
  describeCommandPaletteEmptyState,
} from './commandPaletteModel'

/** La lista del modo búsqueda, con su estado vacío. */
export function CommandPaletteItemList({
  items,
  query,
  running,
  searching,
  focusIdx,
  onFocusIdx,
  onSelectItem,
}: {
  items: Item[]
  query: string
  running: boolean
  searching: boolean
  focusIdx: number
  onFocusIdx: (idx: number) => void
  onSelectItem: (item: Item) => void
}) {
  return (
    <ul className="max-h-[50vh] overflow-y-auto flex-1 min-w-0">
      {items.length === 0 && (
        <li className="px-5 py-6 text-ink-400 italic text-sm text-center">
          {describeCommandPaletteEmptyState({ query, running, searching })}
        </li>
      )}
      {items.map((item, idx) => (
        <li key={`${item.kind}-${commandPaletteItemKey(item)}`} className="flex">
          <button
            onClick={() => onSelectItem(item)}
            onMouseEnter={() => onFocusIdx(idx)}
            className={`flex-1 min-w-0 text-left px-5 py-2.5 flex items-baseline gap-3 transition-colors ${
              idx === focusIdx ? 'bg-paper-100/70' : 'hover:bg-paper-100/40'
            }`}
          >
            <ItemRow item={item} query={query} />
          </button>
          {item.kind === 'content' && item.secondary && (
            <RowAction
              action={item.secondary}
              highlighted={idx === focusIdx}
              onHover={() => onFocusIdx(idx)}
            />
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * La acción de la fila, hermana del botón que la abre: un botón dentro de otro no
 * es accesible. No se queda con el foco: al ejecutarse puede desmontarse («hecha»
 * desaparece) y el foco caería detrás del diálogo, donde el feed de Notas o
 * Imprenta se llevan las teclas. Vuelve al campo, que gobierna la lista.
 */
function RowAction({
  action,
  highlighted,
  onHover,
}: {
  action: NonNullable<CommandSearchContentItem['secondary']>
  highlighted: boolean
  onHover: () => void
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        const campo = event.currentTarget
          .closest('[aria-modal="true"]')
          ?.querySelector('input')
        action.run()
        campo?.focus()
      }}
      onMouseEnter={onHover}
      aria-label={action.ariaLabel}
      title="⇧ Enter"
      className={`shrink-0 px-4 text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors ${
        highlighted ? 'bg-paper-100/70' : ''
      }`}
    >
      {action.label}
    </button>
  )
}
