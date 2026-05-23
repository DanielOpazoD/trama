import { useEffect, useState } from 'react'
import { useIsMobile } from './hooks/useIsMobile'
import {
  Provider,
  useEntitiesQuery,
  useOffline,
  useQuotesQuery,
  useRelationshipsQuery,
} from './state'
import { useTheme } from './hooks/useTheme'
import { Sidebar, type ViewMode } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { CommandPalette } from './components/CommandPalette'
import { ToastHost } from './components/ToastHost'
import { AskBar } from './components/AskBar'
import { ReadingMode } from './components/ReadingMode'
import { Settings } from './components/Settings'
import { Splash } from './components/Splash'
import { ErrorBoundary } from './components/ErrorBoundary'
import { RightPanel, type PendingProposal } from './components/RightPanel'
import { ViewRouter } from './components/ViewRouter'

/**
 * El shell de la app: monta sidebar + topbar + main + paneles flotantes
 * (settings, palette, toast, right panel).
 *
 * El switch de vistas vive en `ViewRouter` y el panel lateral en
 * `RightPanel`, para que este archivo se enfoque solo en orquestar
 * state global (vista activa, entidad seleccionada, propuesta pendiente,
 * apertura de settings/palette/reading) y atajos de teclado.
 */
function Shell() {
  const entitiesQuery = useEntitiesQuery()
  const relationshipsQuery = useRelationshipsQuery()
  const quotesQuery = useQuotesQuery()
  const { offline } = useOffline()
  const { theme, toggle: toggleTheme } = useTheme()

  const loading =
    entitiesQuery.isLoading || relationshipsQuery.isLoading || quotesQuery.isLoading
  const error =
    entitiesQuery.error?.message ??
    relationshipsQuery.error?.message ??
    quotesQuery.error?.message ??
    null

  const isMobile = useIsMobile()
  const [view, setView] = useState<ViewMode>('inicio')
  // En mobile arrancamos con el sidebar colapsado; el usuario lo expande
  // con el ícono del menú.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return window.innerWidth < 768
    return false
  })
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null)
  // Cuando el AskBar deep-linkea a chat con un thread específico.
  const [pendingChatThreadId, setPendingChatThreadId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [readingOpen, setReadingOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Atajos globales. Cmd/Ctrl+K toggle del CommandPalette.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const showProposal = pendingProposal !== null
  // El panel de detalle se puede abrir desde cualquier vista (graph, entidades,
  // citas) — no es exclusivo del grafo.
  const showDetail = !showProposal && selectedEntityId !== null
  const rightPanelOpen = showProposal || showDetail

  return (
    <div className="h-screen w-screen flex overflow-hidden">
      <Sidebar
        view={view}
        onChangeView={(v) => {
          setView(v)
          if (v !== 'grafo') setSelectedEntityId(null)
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
        onSelectEntity={(id) => {
          setView('grafo')
          setSelectedEntityId(id)
        }}
        offline={offline}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex-1 relative overflow-hidden flex flex-col">
        <TopBar view={view} onOpenPalette={() => setPaletteOpen(true)} />
        <div className="flex-1 relative overflow-hidden">
          {error && (
            <div className="alert-error absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 text-sm shadow-md z-10">
              {error}
            </div>
          )}

          {loading ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-ink-300 italic">cargando…</p>
            </div>
          ) : (
            <div key={view} className="animate-view-fade h-full">
              <ViewRouter
                view={view}
                selectedEntityId={selectedEntityId}
                pendingChatThreadId={pendingChatThreadId}
                onSelectEntity={setSelectedEntityId}
                onChangeView={setView}
                onProposal={(text, proposal) => setPendingProposal({ text, proposal })}
                onConsumedInitialThread={() => setPendingChatThreadId(null)}
              />
            </div>
          )}

          {view !== 'chat' && !(isMobile && rightPanelOpen) && (
            <AskBar
              view={view}
              selectedEntityId={selectedEntityId}
              busy={showProposal}
              onProposal={(text, proposal) => setPendingProposal({ text, proposal })}
              onOpenThread={(threadId) => {
                setPendingChatThreadId(threadId)
                setView('chat')
              }}
              onOpenReading={() => setReadingOpen(true)}
            />
          )}

          <ReadingMode
            open={readingOpen}
            onClose={() => setReadingOpen(false)}
            onProposal={(text, proposal) => setPendingProposal({ text, proposal })}
          />
        </div>
      </main>

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(v) => setView(v)}
        onSelectEntity={(id) => setSelectedEntityId(id)}
      />

      <ToastHost />

      <RightPanel
        isMobile={isMobile}
        pendingProposal={pendingProposal}
        selectedEntityId={selectedEntityId}
        onCloseProposal={() => setPendingProposal(null)}
        onCloseDetail={() => setSelectedEntityId(null)}
        onBackdropClose={() => {
          setPendingProposal(null)
          setSelectedEntityId(null)
        }}
        onOpenThreadFromDetail={(threadId) => {
          setSelectedEntityId(null)
          setPendingChatThreadId(threadId)
          setView('chat')
        }}
      />
    </div>
  )
}

export default function App() {
  // ErrorBoundary envuelve Shell pero queda DENTRO del Provider para que
  // el fallback tenga acceso al toast y al QueryClient si los necesita
  // en el futuro. Esta posición captura todo error de render de la UI.
  return (
    <Provider>
      <Splash />
      <ErrorBoundary>
        <div className="animate-shell-rise h-full">
          <Shell />
        </div>
      </ErrorBoundary>
    </Provider>
  )
}
