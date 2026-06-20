import { describe, expect, it } from 'vitest'
import type { ViewMode } from '../../types/view'
import { buildShellVisibility, buildTopBarEntityTabs } from './appShellModel'

describe('appShellModel', () => {
  it('deriva la visibilidad del shell sin leer React state implícito', () => {
    expect(
      buildShellVisibility({
        focusMode: false,
        isMobile: false,
        rightPanelOpen: false,
        view: 'inicio',
      }),
    ).toEqual({
      desktopSidebar: true,
      topBar: true,
      mobileNav: false,
      bottomFade: true,
      askBar: true,
    })

    expect(
      buildShellVisibility({
        focusMode: false,
        isMobile: true,
        rightPanelOpen: true,
        view: 'inicio',
      }),
    ).toMatchObject({ mobileNav: false, bottomFade: false, askBar: false })

    for (const view of ['chat', 'grafo'] as ViewMode[]) {
      expect(
        buildShellVisibility({
          focusMode: false,
          isMobile: false,
          rightPanelOpen: false,
          view,
        }),
      ).toMatchObject({ bottomFade: false, askBar: false })
    }
  })

  it('declara tabs contextuales solo para Entidades', () => {
    expect(buildTopBarEntityTabs({ view: 'inicio', active: 'listado' })).toBeNull()
    expect(buildTopBarEntityTabs({ view: 'entidades', active: 'vinculos' })).toEqual({
      items: [
        { value: 'listado', label: 'Listado' },
        { value: 'vinculos', label: 'Vínculos' },
      ],
      active: 'vinculos',
      ariaLabel: 'Sub-secciones de Entidades',
    })
  })
})
