import type { ReactNode } from 'react'
import type { ViewMode } from '../../types/view'
import type { World } from '../../types/world'
import { MobileBottomNav } from '../MobileBottomNav'
import { SectionAccentBand } from '../SectionAccentBand'
import { TopBar } from '../TopBar'
import {
  buildTopBarEntityTabs,
  type EntityTab,
  type ShellVisibility,
} from './appShellModel'

export function ShellTopChrome({
  visibility,
  view,
  world,
  rightPanelOpen,
  showDetail,
  selectedEntityId,
  entitiesTab,
  actions,
  onChangeWorld,
  onChangeView,
  onOpenSortes,
  onClearSelectedEntity,
  onEntitiesTabChange,
}: {
  visibility: ShellVisibility
  view: ViewMode
  world: World
  rightPanelOpen: boolean
  showDetail: boolean
  selectedEntityId: string | null
  entitiesTab: EntityTab
  actions: ReactNode
  onChangeWorld: (world: World) => void
  onChangeView: (view: ViewMode) => void
  onOpenSortes: () => void
  onClearSelectedEntity: () => void
  onEntitiesTabChange: (tab: EntityTab) => void
}) {
  const entityTabs = buildTopBarEntityTabs({ view, active: entitiesTab })
  return (
    <>
      {visibility.topBar && (
        <div className="animate-shell-topbar">
          <TopBar
            view={view}
            world={world}
            onChangeWorld={onChangeWorld}
            onSortes={onOpenSortes}
            actions={actions}
            breadcrumb={
              showDetail && selectedEntityId
                ? { label: 'entidad', onClickRoot: onClearSelectedEntity }
                : null
            }
            tabs={
              entityTabs
                ? {
                    items: entityTabs.items,
                    active: entityTabs.active,
                    onChange: (v) => onEntitiesTabChange(v as EntityTab),
                    'aria-label': entityTabs.ariaLabel,
                  }
                : null
            }
          />
          <SectionAccentBand view={view} />
        </div>
      )}
      {visibility.mobileNav && !rightPanelOpen && (
        <MobileBottomNav view={view} onChangeView={onChangeView} />
      )}
    </>
  )
}
