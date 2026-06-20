import type { Item } from '../../hooks/useCommandSearch'

export type CommandPaletteMode = 'search' | 'results'

export function getCommandPaletteActiveLength({
  mode,
  itemCount,
  hitCount,
}: {
  mode: CommandPaletteMode
  itemCount: number
  hitCount: number
}): number {
  return mode === 'results' ? hitCount : itemCount
}

export function commandPaletteItemKey(item: Item): string {
  if (item.kind === 'view') return item.view
  if (item.kind === 'action') return item.action
  if (item.kind === 'reveal') return `reveal-${item.moduleId}`
  if (item.kind === 'ask') return 'ask'
  if (item.kind === 'savedQuery') return `saved-${item.id}`
  if (item.kind === 'entity') return item.id
  return item.id
}
