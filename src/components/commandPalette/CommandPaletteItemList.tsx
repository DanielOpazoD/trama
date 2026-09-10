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
        <li key={`${item.kind}-${commandPaletteItemKey(item)}`}>
          <button
            onClick={() => onSelectItem(item)}
            onMouseEnter={() => onFocusIdx(idx)}
            className={`w-full text-left px-5 py-2.5 flex items-baseline gap-3 transition-colors ${
              idx === focusIdx ? 'bg-paper-100/70' : 'hover:bg-paper-100/40'
            }`}
          >
            <ItemRow item={item} query={query} />
          </button>
        </li>
      ))}
    </ul>
  )
}
