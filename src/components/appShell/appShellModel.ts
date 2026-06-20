import type { ViewMode } from '../../types/view'

export type EntityTab = 'listado' | 'vinculos'

export type ShellVisibilityInput = {
  focusMode: boolean
  isMobile: boolean
  rightPanelOpen: boolean
  view: ViewMode
}

export type ShellVisibility = {
  desktopSidebar: boolean
  topBar: boolean
  mobileNav: boolean
  bottomFade: boolean
  askBar: boolean
}

function blocksAskBar(view: ViewMode): boolean {
  return view === 'chat' || view === 'grafo'
}

export function buildShellVisibility({
  focusMode,
  isMobile,
  rightPanelOpen,
  view,
}: ShellVisibilityInput): ShellVisibility {
  const mainInputBlocked = focusMode || blocksAskBar(view) || (isMobile && rightPanelOpen)
  return {
    desktopSidebar: !focusMode && !isMobile,
    topBar: !focusMode,
    mobileNav: !focusMode && isMobile && !rightPanelOpen,
    bottomFade: !mainInputBlocked,
    askBar: !mainInputBlocked,
  }
}

export function buildTopBarEntityTabs({
  view,
  active,
}: {
  view: ViewMode
  active: EntityTab
}): {
  items: Array<{ value: EntityTab; label: string }>
  active: EntityTab
  ariaLabel: string
} | null {
  if (view !== 'entidades') return null
  return {
    items: [
      { value: 'listado', label: 'Listado' },
      { value: 'vinculos', label: 'Vínculos' },
    ],
    active,
    ariaLabel: 'Sub-secciones de Entidades',
  }
}
