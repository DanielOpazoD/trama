import type { Dispatch, SetStateAction } from 'react'
import type { CommandSearchEntity } from '../../hooks/commandSearchModel'
import type { Item } from '../../hooks/useCommandSearch'
import { CommandPaletteItemList } from './CommandPaletteItemList'
import { CommandPalettePeekSlot } from './CommandPalettePeekSlot'
import {
  describeCommandPaletteHints,
  describeCommandPaletteScope,
} from './commandPaletteKeys'

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
  entitiesForPeek: CommandSearchEntity[] | undefined
  onFocusIdx: Dispatch<SetStateAction<number>>
  onSelectItem: (item: Item) => void
}) {
  const scope = describeCommandPaletteScope(query)
  return (
    <>
      {scope && (
        <p className="px-5 pt-2 text-micro uppercase tracking-eyebrow text-ink-300">
          {scope}
        </p>
      )}
      <div className="flex">
        <CommandPaletteItemList
          items={items}
          query={query}
          running={running}
          searching={searching}
          focusIdx={focusIdx}
          onFocusIdx={onFocusIdx}
          onSelectItem={onSelectItem}
        />
        <CommandPalettePeekSlot item={items[focusIdx]} entities={entitiesForPeek} />
      </div>
      <div className="px-5 py-2 border-t border-ink-100/60 text-micro uppercase tracking-eyebrow text-ink-300 flex justify-between gap-3">
        <span className="truncate">{describeCommandPaletteHints(query)}</span>
        <span role="status" className="shrink-0">
          {running ? 'consultando tu trama…' : `${items.length} resultados`}
        </span>
      </div>
    </>
  )
}
