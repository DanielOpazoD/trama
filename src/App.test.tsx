import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { ViewMode } from './types/view'
import type { World } from './types/world'

const appMocks = vi.hoisted(() => ({
  useIsMobile: vi.fn(),
  useEntitiesQuery: vi.fn(),
  useRelationshipsQuery: vi.fn(),
  useQuotesQuery: vi.fn(),
  useOffline: vi.fn(),
  useTheme: vi.fn(),
  useAchievements: vi.fn(),
  useWeeklyProactiveNudge: vi.fn(),
  useTimeOfDayAccent: vi.fn(),
  shortcutConfig: null as null | {
    onTogglePalette: () => void
    onOpenPalette: () => void
    onToggleShortcuts: () => void
    onToggleFocusMode: () => void
  },
  oauthReturn: null as null | { provider: 'spotify' | 'x'; ok: boolean },
  clearOAuthReturn: vi.fn(),
  startViewTransition: vi.fn((fn: () => void) => fn()),
}))

vi.mock('./state', () => ({
  Provider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="provider">{children}</div>
  ),
  useEntitiesQuery: appMocks.useEntitiesQuery,
  useRelationshipsQuery: appMocks.useRelationshipsQuery,
  useQuotesQuery: appMocks.useQuotesQuery,
  useOffline: appMocks.useOffline,
}))

vi.mock('./hooks/useIsMobile', () => ({
  useIsMobile: appMocks.useIsMobile,
}))

vi.mock('./hooks/useInitialView', async () => {
  const React = await import('react')
  return {
    useInitialView: () => React.useState<ViewMode>('inicio'),
  }
})

vi.mock('./hooks/useSearchParamState', async () => {
  const React = await import('react')
  return {
    useSearchParamState: () => React.useState<string | null>(null),
  }
})

vi.mock('./hooks/useGlobalShortcuts', () => ({
  useGlobalShortcuts: (config: NonNullable<typeof appMocks.shortcutConfig>) => {
    appMocks.shortcutConfig = config
  },
}))

vi.mock('./hooks/useTheme', () => ({
  useTheme: appMocks.useTheme,
}))

vi.mock('./hooks/useTimeOfDayAccent', () => ({
  useTimeOfDayAccent: appMocks.useTimeOfDayAccent,
}))

vi.mock('./hooks/useAchievements', () => ({
  useAchievements: appMocks.useAchievements,
}))

vi.mock('./hooks/useWeeklyProactiveNudge', () => ({
  useWeeklyProactiveNudge: appMocks.useWeeklyProactiveNudge,
}))

vi.mock('./lib/viewTransition', () => ({
  startViewTransition: appMocks.startViewTransition,
}))

vi.mock('./lib/oauthReturn', () => ({
  readOAuthReturn: () => appMocks.oauthReturn,
  clearOAuthReturn: appMocks.clearOAuthReturn,
}))

vi.mock('./components/AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('./components/AppPinGate', () => ({
  AppPinGate: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('./components/Splash', () => ({
  Splash: () => null,
}))

vi.mock('./components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('./components/PreviewBanner', () => ({
  PreviewBanner: () => <div>preview banner</div>,
}))

vi.mock('./components/ToastHost', () => ({
  ToastHost: () => <div>toast host</div>,
}))

vi.mock('./components/HomeSkeleton', () => ({
  HomeSkeleton: () => <div>home skeleton</div>,
}))

vi.mock('./components/SectionAccentBand', () => ({
  SectionAccentBand: ({ view }: { view: ViewMode }) => <div>accent {view}</div>,
}))

vi.mock('./components/Sidebar', () => ({
  Sidebar: ({
    view,
    world,
    onChangeView,
    onChangeWorld,
    onToggleCollapsed,
    onOpenSettings,
    onOpenPalette,
  }: {
    view: ViewMode
    world: World
    onChangeView: (view: ViewMode) => void
    onChangeWorld: (world: World) => void
    onToggleCollapsed: () => void
    onOpenSettings: () => void
    onOpenPalette: () => void
  }) => (
    <aside>
      sidebar {view} {world}
      <button onClick={() => onChangeView('citas')}>ir citas</button>
      <button onClick={() => onChangeView('grafo')}>ir grafo</button>
      <button onClick={() => onChangeWorld('notas')}>mundo notas</button>
      <button onClick={onToggleCollapsed}>toggle sidebar</button>
      <button onClick={onOpenSettings}>abrir settings</button>
      <button onClick={onOpenPalette}>abrir palette</button>
    </aside>
  ),
}))

vi.mock('./components/TopBar', () => ({
  TopBar: ({
    view,
    onSortes,
    breadcrumb,
    tabs,
  }: {
    view: ViewMode
    onSortes: () => void
    breadcrumb: { label: string; onClickRoot: () => void } | null
    tabs: null | { onChange: (value: string) => void }
  }) => (
    <header>
      topbar {view} {breadcrumb?.label}
      <button onClick={onSortes}>abrir sortes</button>
      {tabs && <button onClick={() => tabs.onChange('vinculos')}>tab vínculos</button>}
    </header>
  ),
}))

vi.mock('./components/ViewRouter', () => ({
  ViewRouter: ({
    view,
    entitiesTab,
    pendingChatThreadId,
    onSelectEntity,
    onChangeView,
    onProposal,
    onConsumedInitialThread,
    onSortes,
    onEspejo,
  }: {
    view: ViewMode
    entitiesTab: string
    pendingChatThreadId: string | null
    onSelectEntity: (id: string | null) => void
    onChangeView: (view: ViewMode) => void
    onProposal: (
      text: string,
      proposal: { entities: []; relationships: []; quotes: [] },
    ) => void
    onConsumedInitialThread: () => void
    onSortes: () => void
    onEspejo: () => void
  }) => (
    <section>
      view:{view} tab:{entitiesTab} thread:{pendingChatThreadId ?? 'none'}
      <button onClick={() => onSelectEntity('e1')}>select entity</button>
      <button onClick={() => onChangeView('momentos')}>router momentos</button>
      <button
        onClick={() =>
          onProposal('texto', { entities: [], relationships: [], quotes: [] })
        }
      >
        router proposal
      </button>
      <button onClick={onConsumedInitialThread}>consume thread</button>
      <button onClick={onSortes}>router sortes</button>
      <button onClick={onEspejo}>router espejo</button>
    </section>
  ),
}))

vi.mock('./components/AskBar', () => ({
  AskBar: ({
    view,
    selectedEntityId,
    busy,
    onOpenReading,
    onProposal,
    onOpenThread,
  }: {
    view: ViewMode
    selectedEntityId: string | null
    busy: boolean
    onOpenReading: () => void
    onProposal: (
      text: string,
      proposal: { entities: []; relationships: []; quotes: [] },
    ) => void
    onOpenThread: (id: string) => void
  }) => (
    <div>
      askbar {view} {selectedEntityId ?? 'none'} {busy ? 'busy' : 'idle'}
      <button onClick={onOpenReading}>abrir lectura</button>
      <button
        onClick={() => onProposal('ask', { entities: [], relationships: [], quotes: [] })}
      >
        ask proposal
      </button>
      <button onClick={() => onOpenThread('thread-1')}>ask thread</button>
    </div>
  ),
}))

vi.mock('./components/ReadingMode', () => ({
  ReadingMode: ({
    open,
    onClose,
    onProposal,
  }: {
    open: boolean
    onClose: () => void
    onProposal: (
      text: string,
      proposal: { entities: []; relationships: []; quotes: [] },
    ) => void
  }) =>
    open ? (
      <div>
        reading open
        <button onClick={onClose}>cerrar lectura</button>
        <button
          onClick={() =>
            onProposal('reading', { entities: [], relationships: [], quotes: [] })
          }
        >
          lectura proposal
        </button>
      </div>
    ) : null,
}))

vi.mock('./components/Settings', () => ({
  Settings: ({
    open,
    initialSection,
    oauthReturn,
    theme,
    onSetTheme,
    onClose,
  }: {
    open: boolean
    initialSection?: string
    oauthReturn: unknown
    theme: string
    onSetTheme: (theme: 'paper' | 'night' | 'vela') => void
    onClose: () => void
  }) =>
    open ? (
      <div>
        settings {theme} {initialSection ?? 'none'} {oauthReturn ? 'oauth' : 'plain'}
        <button onClick={() => onSetTheme('night')}>theme night</button>
        <button onClick={onClose}>cerrar settings</button>
      </div>
    ) : null,
}))

vi.mock('./components/CommandPalette', () => ({
  CommandPalette: ({
    open,
    onClose,
    onNavigate,
    onSelectEntity,
    onOpenThread,
    onAction,
  }: {
    open: boolean
    onClose: () => void
    onNavigate: (view: ViewMode) => void
    onSelectEntity: (id: string) => void
    onOpenThread: (id: string) => void
    onAction: (action: string) => void
  }) =>
    open ? (
      <div>
        palette open
        <button onClick={() => onNavigate('twitter')}>palette twitter</button>
        <button onClick={() => onSelectEntity('e1')}>palette entity</button>
        <button onClick={() => onOpenThread('thread-2')}>palette thread</button>
        <button onClick={() => onAction('open-settings')}>action settings</button>
        <button onClick={() => onAction('open-shortcuts')}>action shortcuts</button>
        <button onClick={() => onAction('open-sortes')}>action sortes</button>
        <button onClick={() => onAction('open-espejo')}>action espejo</button>
        <button onClick={() => onAction('new-quote')}>action new quote</button>
        <button onClick={onClose}>cerrar palette</button>
      </div>
    ) : null,
}))

vi.mock('./components/ShortcutsModal', () => ({
  ShortcutsModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div>
        shortcuts open
        <button onClick={onClose}>cerrar shortcuts</button>
      </div>
    ) : null,
}))

vi.mock('./components/Sortes', () => ({
  Sortes: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div>
        sortes open
        <button onClick={onClose}>cerrar sortes</button>
      </div>
    ) : null,
}))

vi.mock('./components/Espejo', () => ({
  Espejo: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div>
        espejo open
        <button onClick={onClose}>cerrar espejo</button>
      </div>
    ) : null,
}))

vi.mock('./components/Onboarding', () => ({
  Onboarding: ({ enabled, onComplete }: { enabled: boolean; onComplete: () => void }) =>
    enabled ? (
      <div>
        onboarding enabled
        <button onClick={onComplete}>complete onboarding</button>
      </div>
    ) : null,
}))

vi.mock('./components/MobileBottomNav', () => ({
  MobileBottomNav: ({
    view,
    onChangeView,
  }: {
    view: ViewMode
    onChangeView: (view: ViewMode) => void
  }) => (
    <nav>
      mobile nav {view}
      <button onClick={() => onChangeView('citas')}>mobile citas</button>
    </nav>
  ),
}))

vi.mock('./components/RightPanel', () => ({
  RightPanel: ({
    isMobile,
    pendingProposal,
    selectedEntityId,
    onCloseProposal,
    onCloseDetail,
    onBackdropClose,
    onOpenThreadFromDetail,
  }: {
    isMobile: boolean
    pendingProposal: unknown
    selectedEntityId: string | null
    onCloseProposal: () => void
    onCloseDetail: () => void
    onBackdropClose: () => void
    onOpenThreadFromDetail: (id: string) => void
  }) => (
    <aside>
      right {isMobile ? 'mobile' : 'desktop'}{' '}
      {pendingProposal ? 'proposal' : 'no-proposal'} {selectedEntityId ?? 'no-detail'}
      <button onClick={onCloseProposal}>close proposal</button>
      <button onClick={onCloseDetail}>close detail</button>
      <button onClick={onBackdropClose}>backdrop close</button>
      <button onClick={() => onOpenThreadFromDetail('thread-detail')}>
        detail thread
      </button>
    </aside>
  ),
}))

vi.mock('./components/notas/NotasWorld', () => ({
  NotasWorld: ({
    world,
    onChangeWorld,
  }: {
    world: World
    onChangeWorld: (world: World) => void
  }) => (
    <section>
      notas world {world}
      <button onClick={() => onChangeWorld('trama')}>volver trama</button>
    </section>
  ),
}))

function installDefaultQueries({
  loading = false,
  empty = false,
  error = null as Error | null,
} = {}) {
  appMocks.useEntitiesQuery.mockReturnValue({
    data: empty ? [] : [{ id: 'e1', name: 'Borges' }],
    isLoading: loading,
    error,
  })
  appMocks.useRelationshipsQuery.mockReturnValue({
    data: empty ? [] : [{ id: 'r1' }],
    isLoading: loading,
    error: null,
  })
  appMocks.useQuotesQuery.mockReturnValue({
    data: empty ? [] : [{ id: 'q1' }],
    isLoading: loading,
    error: null,
  })
}

describe('<App />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    appMocks.shortcutConfig = null
    appMocks.oauthReturn = null
    appMocks.useIsMobile.mockReturnValue(false)
    appMocks.useOffline.mockReturnValue({ offline: false })
    appMocks.useTheme.mockReturnValue({ theme: 'paper', setTheme: vi.fn() })
    installDefaultQueries()
  })

  it('orquesta navegación, overlays y propuestas desde el shell principal', async () => {
    const user = userEvent.setup()

    render(<App />)

    expect(screen.getByText(/sidebar inicio trama/i)).toBeInTheDocument()
    expect(screen.getByText(/view:inicio/i)).toBeInTheDocument()
    expect(screen.getByText(/askbar inicio none idle/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ir citas' }))
    expect(screen.getByText(/view:citas/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'abrir lectura' }))
    expect(screen.getByText('reading open')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'lectura proposal' }))
    expect(screen.getByText(/right desktop proposal no-detail/i)).toBeInTheDocument()
    expect(screen.getByText(/askbar citas none busy/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close proposal' }))
    await user.click(screen.getByRole('button', { name: 'abrir settings' }))
    expect(screen.getByText(/settings paper none plain/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'abrir sortes' }))
    expect(screen.getByText('sortes open')).toBeInTheDocument()
  })

  it('conecta command palette, shortcuts, detalle y threads', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'abrir palette' }))
    expect(screen.getByText('palette open')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'palette entity' }))
    expect(appMocks.startViewTransition).toHaveBeenCalled()
    expect(screen.getByText(/right desktop no-proposal e1/i)).toBeInTheDocument()
    expect(screen.getByText(/topbar inicio Borges/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'detail thread' }))
    expect(screen.getByText(/view:chat/i)).toBeInTheDocument()
    expect(screen.getByText(/thread:thread-detail/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'abrir palette' }))
    await user.click(screen.getByRole('button', { name: 'action shortcuts' }))
    expect(screen.getByText('shortcuts open')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'action new quote' }))
    expect(screen.getByText(/view:citas/i)).toBeInTheDocument()
  })

  it('maneja mobile nav, panel derecho y modo focus', async () => {
    const user = userEvent.setup()
    appMocks.useIsMobile.mockReturnValue(true)

    render(<App />)

    expect(screen.getByText(/mobile nav inicio/i)).toBeInTheDocument()
    expect(screen.queryByText(/sidebar inicio/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'select entity' }))
    expect(screen.getByText(/right mobile no-proposal e1/i)).toBeInTheDocument()
    expect(screen.queryByText(/mobile nav inicio/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close detail' }))
    expect(screen.getByText(/mobile nav inicio/i)).toBeInTheDocument()

    act(() => {
      appMocks.shortcutConfig?.onToggleFocusMode()
    })

    expect(
      screen.getByRole('button', { name: 'Salir del modo focus' }),
    ).toBeInTheDocument()
    expect(window.localStorage.getItem('trama:focus-mode')).toBe('1')
  })

  it('muestra loading/error, onboarding vacío y retorno OAuth', () => {
    appMocks.oauthReturn = { provider: 'spotify', ok: true }
    installDefaultQueries({ loading: true, empty: true, error: new Error('falló data') })

    render(<App />)

    expect(screen.getByText('falló data')).toBeInTheDocument()
    expect(screen.getByText('home skeleton')).toBeInTheDocument()
    expect(screen.getByText(/settings paper spotify oauth/i)).toBeInTheDocument()
    expect(appMocks.clearOAuthReturn).toHaveBeenCalledOnce()
  })

  it('persiste y conmuta el mundo activo', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'mundo notas' }))

    expect(screen.getByText(/notas world notas/i)).toBeInTheDocument()
    expect(window.localStorage.getItem('trama:world')).toBe('notas')

    await user.click(screen.getByRole('button', { name: 'volver trama' }))

    expect(screen.getByText(/sidebar inicio trama/i)).toBeInTheDocument()
    expect(window.localStorage.getItem('trama:world')).toBe('trama')
  })

  it('declara dependencias reales para el retorno OAuth', () => {
    const source = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')

    expect(source).not.toContain('eslint-disable-next-line react-hooks/exhaustive-deps')
  })
})
