import type { CommandAction } from '../../hooks/useCommandSearch'
import type { ViewMode } from '../../types/view'
import type { TramaTarget } from './worldShellModel'

type ShellModalAction = 'settings' | 'shortcuts' | 'sortes' | 'espejo' | 'careo'
export type ShellPaletteIntent =
  { kind: 'modal'; modal: ShellModalAction } | { kind: 'view'; view: ViewMode }

export function resolveShellPaletteAction(action: CommandAction): ShellPaletteIntent {
  switch (action) {
    case 'open-settings':
      return { kind: 'modal', modal: 'settings' }
    case 'open-shortcuts':
      return { kind: 'modal', modal: 'shortcuts' }
    case 'open-sortes':
      return { kind: 'modal', modal: 'sortes' }
    case 'open-espejo':
      return { kind: 'modal', modal: 'espejo' }
    case 'open-careo':
      return { kind: 'modal', modal: 'careo' }
    case 'new-entity':
      return { kind: 'view', view: 'entidades' }
    case 'new-quote':
      return { kind: 'view', view: 'citas' }
    case 'new-momento':
      return { kind: 'view', view: 'momentos' }
  }
}

/**
 * La vista con que Trama monta al llegar desde otro mundo. Una entidad o un modal
 * no tienen vista propia: se abren sobre la de siempre.
 */
export function initialViewForTarget(
  target: TramaTarget | null | undefined,
): ViewMode | undefined {
  if (!target) return undefined
  switch (target.kind) {
    case 'view':
      return target.view
    case 'thread':
      return 'chat'
    case 'action': {
      const intent = resolveShellPaletteAction(target.action)
      return intent.kind === 'view' ? intent.view : undefined
    }
    case 'entity':
      return undefined
  }
}
