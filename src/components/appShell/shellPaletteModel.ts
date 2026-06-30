import type { CommandAction } from '../../hooks/useCommandSearch'
import type { ViewMode } from '../../types/view'

export type ShellModalAction = 'settings' | 'shortcuts' | 'sortes' | 'espejo' | 'careo'
export type ShellPaletteIntent =
  | { kind: 'modal'; modal: ShellModalAction }
  | { kind: 'view'; view: ViewMode }

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
