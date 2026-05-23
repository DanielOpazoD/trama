import { useEffect, useState } from 'react'
import { useIsMobile } from './hooks/useIsMobile'
import {
  Provider,
  useEntitiesQuery,
  useQuotesQuery,
  useRelationshipsQuery,
  useOffline,
} from './state'
import { useTheme } from './hooks/useTheme'
import { Sidebar, type ViewMode } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import GraphView from './components/GraphView'
import { EntitiesView } from './components/EntitiesView'
import { QuotesView } from './components/QuotesView'
import { RelationshipsView } from './components/RelationshipsView'
import { ListeningView } from './components/ListeningView'
import { ChatView } from './components/ChatView'
import { ProactiveView } from './components/ProactiveView'
import { HomeView } from './components/HomeView'
import { CommandPalette } from './components/CommandPalette'
import { AskBar } from './components/AskBar'
import { ProposalPanel } from './components/ProposalPanel'
import { NodeDetailPanel } from './components/NodeDetailPanel'
import { ReadingMode } from './components/ReadingMode'
import { Settings } from './components/Settings'
import { Splash } from './components/Splash'
import type { ExtractionProposal } from './types'

type PendingProposal = { text: string; proposal: ExtractionProposal }

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
  // On phones the sidebar starts collapsed by default; the user expands it
  // with the menu icon.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return window.innerWidth < 768
    return false
  })
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null)
  // Set when the AskBar deep-links to chat with a specific thread.
  const [pendingChatThreadId, setPendingChatThreadId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [readingOpen, setReadingOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Global keyboard shortcuts. Cmd/Ctrl+K toggles the command palette.
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
  // Detail panel is available from any view, not just the graph — clicking an
  // entity card in Entidades or an attribution in Citas opens the same panel.
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
        <TopBar view={view} />
        <div className="flex-1 relative overflow-hidden">
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-50/95 border border-red-200 rounded-lg text-sm text-red-800 shadow-md z-10">
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-ink-300 italic">cargando…</p>
          </div>
        ) : (
          <div key={view} className="animate-view-fade h-full">
            {view === 'grafo' && (
              <GraphView
                selectedId={selectedEntityId}
                onSelect={setSelectedEntityId}
                onProposal={(text, proposal) => setPendingProposal({ text, proposal })}
              />
            )}
            {view === 'chat' && (
              <ChatView
                initialThreadId={pendingChatThreadId}
                onConsumedInitialThread={() => setPendingChatThreadId(null)}
              />
            )}
            {view !== 'grafo' && view !== 'chat' && (
              <div id="main-scroll" className="h-full overflow-y-auto px-8 py-10 pb-32 max-w-3xl mx-auto">
                {view === 'inicio' && (
                  <HomeView
                    onNavigate={(v) => setView(v)}
                    onSelectEntity={setSelectedEntityId}
                  />
                )}
                {view === 'entidades' && (
                  <EntitiesView onSelectEntity={setSelectedEntityId} />
                )}
                {view === 'citas' && (
                  <QuotesView onSelectEntity={setSelectedEntityId} />
                )}
                {view === 'relaciones' && (
                  <RelationshipsView
                    onSelectEntity={setSelectedEntityId}
                    onProposal={(text, proposal) => setPendingProposal({ text, proposal })}
                  />
                )}
                {view === 'escuchas' && (
                  <ListeningView
                    onSelectEntity={setSelectedEntityId}
                    onProposal={(text, proposal) => setPendingProposal({ text, proposal })}
                  />
                )}
                {view === 'sugerencias' && <ProactiveView />}
              </div>
            )}
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
        onSelectEntity={(id) => {
          setSelectedEntityId(id)
        }}
      />

      {/* Floating right-side panel — appears as a glass card over the canvas
          instead of as a hard-edge column. Click outside to close. */}
      {rightPanelOpen && (
        <>
          <button
            onClick={() => {
              setPendingProposal(null)
              setSelectedEntityId(null)
            }}
            aria-label="Cerrar panel"
            className="fixed inset-0 z-10 cursor-default"
            tabIndex={-1}
          />
          {/* Desktop: glass card anchored to the right. Mobile: bottom sheet
              that slides up from below, covering most of the screen. */}
          <div
            className={
              isMobile
                ? 'fixed inset-x-0 bottom-0 top-12 z-20 animate-slide-up pointer-events-none'
                : 'fixed top-4 right-4 bottom-4 w-[22rem] max-w-[calc(100vw-2rem)] z-20 animate-slide-in-right pointer-events-none'
            }
          >
            <div
              className={
                isMobile
                  ? 'relative paper-grain h-full pointer-events-auto rounded-t-2xl border-t border-x border-ink-100/50 bg-paper-50/95 backdrop-blur-md shadow-2xl shadow-ink-900/25 overflow-hidden'
                  : 'relative paper-grain h-full pointer-events-auto rounded-2xl border border-ink-100/50 bg-paper-50/85 backdrop-blur-md shadow-2xl shadow-ink-900/15 overflow-hidden'
              }
            >
              {/* Drag handle on mobile — purely visual cue that it's a sheet. */}
              {isMobile && (
                <div className="pt-2 pb-1 flex justify-center">
                  <div className="w-10 h-1 rounded-full bg-ink-200/70" />
                </div>
              )}
              {showProposal && pendingProposal && (
                <ProposalPanel
                  proposal={pendingProposal.proposal}
                  sourceText={pendingProposal.text}
                  onClose={() => setPendingProposal(null)}
                  onConfirmed={() => setPendingProposal(null)}
                />
              )}
              {showDetail && selectedEntityId && (
                <NodeDetailPanel
                  entityId={selectedEntityId}
                  onClose={() => setSelectedEntityId(null)}
                  onOpenThread={(threadId) => {
                    setSelectedEntityId(null)
                    setPendingChatThreadId(threadId)
                    setView('chat')
                  }}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function App() {
  return (
    <Provider>
      <Splash />
      <div className="animate-shell-rise h-full">
        <Shell />
      </div>
    </Provider>
  )
}
