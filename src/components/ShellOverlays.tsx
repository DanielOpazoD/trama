import { lazy, Suspense } from 'react'
import type { OAuthReturn } from '../lib/oauthReturn'
import type { Theme } from '../hooks/useTheme'
import type { CommandAction } from './CommandPalette'
import type { ViewMode } from '../types/view'
import type { NotasSection } from '../types/notas'

const CommandPalette = lazy(() =>
  import('./CommandPalette').then((m) => ({ default: m.CommandPalette })),
)
const ShortcutsModal = lazy(() =>
  import('./ShortcutsModal').then((m) => ({ default: m.ShortcutsModal })),
)
const Atril = lazy(() => import('./Atril').then((m) => ({ default: m.Atril })))
const Espejo = lazy(() => import('./Espejo').then((m) => ({ default: m.Espejo })))
const Careo = lazy(() => import('./Careo').then((m) => ({ default: m.Careo })))
const Settings = lazy(() => import('./Settings').then((m) => ({ default: m.Settings })))

export function ShellOverlays({
  settingsOpen,
  onCloseSettings,
  theme,
  onSetTheme,
  oauthReturn,
  paletteOpen,
  onClosePalette,
  onNavigate,
  onSelectEntity,
  onOpenThread,
  onRevealNotasModule,
  onPaletteAction,
  shortcutsOpen,
  onCloseShortcuts,
  sortesOpen,
  onCloseSortes,
  espejoOpen,
  onCloseEspejo,
  careoOpen,
  onCloseCareo,
}: {
  settingsOpen: boolean
  onCloseSettings: () => void
  theme: Theme
  onSetTheme: (theme: Theme) => void
  oauthReturn: OAuthReturn | null
  paletteOpen: boolean
  onClosePalette: () => void
  onNavigate: (view: ViewMode) => void
  onSelectEntity: (id: string) => void
  onOpenThread: (threadId: string) => void
  onRevealNotasModule: (moduleId: NotasSection) => void
  onPaletteAction: (action: CommandAction) => void
  shortcutsOpen: boolean
  onCloseShortcuts: () => void
  sortesOpen: boolean
  onCloseSortes: () => void
  espejoOpen: boolean
  onCloseEspejo: () => void
  careoOpen: boolean
  onCloseCareo: () => void
}) {
  return (
    <>
      {settingsOpen && (
        <Suspense fallback={null}>
          <Settings
            open={settingsOpen}
            onClose={onCloseSettings}
            theme={theme}
            onSetTheme={onSetTheme}
            initialSection={oauthReturn?.provider}
            oauthReturn={oauthReturn}
          />
        </Suspense>
      )}

      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            open={paletteOpen}
            onClose={onClosePalette}
            onNavigate={onNavigate}
            onSelectEntity={onSelectEntity}
            onOpenThread={onOpenThread}
            onRevealNotasModule={onRevealNotasModule}
            onAction={onPaletteAction}
          />
        </Suspense>
      )}

      {shortcutsOpen && (
        <Suspense fallback={null}>
          <ShortcutsModal open={shortcutsOpen} onClose={onCloseShortcuts} />
        </Suspense>
      )}

      {sortesOpen && (
        <Suspense fallback={null}>
          <Atril open={sortesOpen} onClose={onCloseSortes} />
        </Suspense>
      )}

      {espejoOpen && (
        <Suspense fallback={null}>
          <Espejo open={espejoOpen} onClose={onCloseEspejo} />
        </Suspense>
      )}

      {careoOpen && (
        <Suspense fallback={null}>
          <Careo open={careoOpen} onClose={onCloseCareo} />
        </Suspense>
      )}
    </>
  )
}
