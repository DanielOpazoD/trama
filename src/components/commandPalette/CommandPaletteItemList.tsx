import type { Dispatch, SetStateAction } from 'react'
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
  onFocusIdx: Dispatch<SetStateAction<number>>
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
          {/* La acción es hermana de la fila, nunca anidada: un botón dentro de otro
              no es accesible. ⇧Enter la dispara desde el campo. */}
          {item.kind === 'content' && item.secondary && (
            <button
              type="button"
              onClick={item.secondary.run}
              onMouseEnter={() => onFocusIdx(idx)}
              aria-label={item.secondary.ariaLabel}
              title="⇧ Enter"
              className={`shrink-0 px-4 text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors ${
                idx === focusIdx ? 'bg-paper-100/70' : ''
              }`}
            >
              {item.secondary.label}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
