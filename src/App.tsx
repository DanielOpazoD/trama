import { useState } from 'react'
import {
  Provider,
  useEntitiesQuery,
  useQuotesQuery,
  useRelationshipsQuery,
  useOffline,
} from './state'
import { useTheme } from './hooks/useTheme'
import { Sidebar, type ViewMode } from './components/Sidebar'
import GraphView from './components/GraphView'
import { EntitiesView } from './components/EntitiesView'
import { QuotesView } from './components/QuotesView'
import { RelationshipsView } from './components/RelationshipsView'
import { ListeningView } from './components/ListeningView'
import { ChatView } from './components/ChatView'
import { ProactiveView } from './components/ProactiveView'
import { AskBar } from './components/AskBar'
import { ProposalPanel } from './components/ProposalPanel'
import { NodeDetailPanel } from './components/NodeDetailPanel'
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

  const [view, setView] = useState<ViewMode>('grafo')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

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

      <main className="flex-1 relative overflow-hidden">
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
            {view === 'chat' && <ChatView />}
            {view !== 'grafo' && view !== 'chat' && (
              <div className="h-full overflow-y-auto px-8 py-10 pb-32 max-w-3xl mx-auto">
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

        {view !== 'chat' && (
          <AskBar
            view={view}
            selectedEntityId={selectedEntityId}
            busy={showProposal}
            onProposal={(text, proposal) => setPendingProposal({ text, proposal })}
          />
        )}
      </main>

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
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
          <div className="fixed top-4 right-4 bottom-4 w-[22rem] max-w-[calc(100vw-2rem)] z-20 animate-slide-in-right pointer-events-none">
            <div className="h-full pointer-events-auto rounded-2xl border border-ink-100/50 bg-paper-50/85 backdrop-blur-md shadow-2xl shadow-ink-900/15 overflow-hidden">
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
