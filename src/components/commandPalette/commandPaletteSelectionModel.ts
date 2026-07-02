import type { QueryHit, QueryInput } from '../../api/query'
import type { CommandAction, Item } from '../../hooks/useCommandSearch'
import type { NotasSection } from '../../types/notas'
import type { ViewMode } from '../../types/view'

export type CommandPaletteSelectionCommand =
  | { kind: 'navigate'; view: ViewMode }
  | { kind: 'selectEntity'; id: string }
  | { kind: 'action'; action: CommandAction }
  | { kind: 'openThread'; threadId: string }
  | { kind: 'revealNotasModule'; moduleId: NotasSection }
  | { kind: 'runAsk'; q: string }
  | { kind: 'runAst'; query: QueryInput; heading: string }

export function getCommandPaletteHitTarget(
  hit: QueryHit,
): Extract<
  CommandPaletteSelectionCommand,
  { kind: 'navigate' | 'selectEntity' | 'revealNotasModule' }
> {
  switch (hit.kind) {
    case 'entity':
      return { kind: 'selectEntity', id: hit.id }
    case 'quote':
      return { kind: 'navigate', view: 'citas' }
    case 'momento':
      return { kind: 'navigate', view: 'momentos' }
    case 'note':
      return { kind: 'revealNotasModule', moduleId: 'notas' }
  }
}

export function getCommandPaletteItemCommand(
  item: Item,
  { canOpenThread = false }: { canOpenThread?: boolean } = {},
): CommandPaletteSelectionCommand {
  switch (item.kind) {
    case 'view':
      return { kind: 'navigate', view: item.view }
    case 'action':
      return { kind: 'action', action: item.action }
    case 'entity':
      return { kind: 'selectEntity', id: item.id }
    case 'quote':
      return { kind: 'selectEntity', id: item.entityId }
    case 'momento':
      return { kind: 'navigate', view: 'momentos' }
    case 'cronica':
      return { kind: 'navigate', view: 'inicio' }
    case 'chat':
      return canOpenThread
        ? { kind: 'openThread', threadId: item.threadId }
        : { kind: 'navigate', view: 'chat' }
    case 'reveal':
      return { kind: 'revealNotasModule', moduleId: item.moduleId }
    case 'ask':
      return { kind: 'runAsk', q: item.q }
    case 'savedQuery':
      return { kind: 'runAst', query: item.query, heading: item.name }
  }
}
