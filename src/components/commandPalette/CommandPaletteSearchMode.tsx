import type { Dispatch, SetStateAction } from 'react'
import type { Item } from '../../hooks/useCommandSearch'
import { ItemRow, PeekPanel } from '../CommandPaletteItems'
import { commandPaletteItemKey } from './commandPaletteModel'

export function CommandPaletteSearchMode({
  items,
  query,
  running,
  searching,
  focusIdx,
  entitiesForPeek,
  onFocusIdx,
  onSelectItem,
}: {
  items: Item[]
  query: string
  running: boolean
  searching: boolean
  focusIdx: number
  entitiesForPeek: Parameters<typeof PeekPanel>[0]['entities']
  onFocusIdx: Dispatch<SetStateAction<number>>
  onSelectItem: (item: Item) => void
}) {
  return (
    <>
      <div className="flex">
        <ul className="max-h-[50vh] overflow-y-auto flex-1 min-w-0">
          {items.length === 0 && (
            <li className="px-5 py-6 text-ink-400 italic text-sm text-center">
              {running ? 'consultando…' : searching ? 'buscando…' : 'nada coincide'}
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
        {items[focusIdx] && (
          <aside
            aria-label="Vista previa del resultado"
            className="hidden md:block w-72 shrink-0 border-l border-ink-100/60 bg-paper-100/30 max-h-[50vh] overflow-y-auto"
          >
            <PeekPanel item={items[focusIdx]} entities={entitiesForPeek} />
          </aside>
        )}
      </div>
      <div className="px-5 py-2 border-t border-ink-100/60 text-micro uppercase tracking-eyebrow text-ink-300 flex justify-between">
        <span>↑↓ navegar · enter abrir · esc cerrar</span>
        <span>{items.length} resultados</span>
      </div>
    </>
  )
}
