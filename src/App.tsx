import { useState } from 'react'
import { StateProvider, useTrama } from './state'
import { Sidebar, type ViewMode } from './components/Sidebar'
import GraphView from './components/GraphView'
import { EntitiesView } from './components/EntitiesView'
import { QuotesView } from './components/QuotesView'
import { RelationshipsView } from './components/RelationshipsView'
import { ExtractBar } from './components/ExtractBar'
import { ProposalPanel } from './components/ProposalPanel'
import { NodeDetailPanel } from './components/NodeDetailPanel'
import type { ExtractionProposal } from './types'

type PendingProposal = { text: string; proposal: ExtractionProposal }

function Shell() {
  const { loading, error } = useTrama()
  const [view, setView] = useState<ViewMode>('grafo')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null)

  const showProposal = pendingProposal !== null
  const showDetail = !showProposal && view === 'grafo' && selectedEntityId !== null
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
          <>
            {view === 'grafo' && (
              <GraphView
                selectedId={selectedEntityId}
                onSelect={setSelectedEntityId}
              />
            )}
            {view !== 'grafo' && (
              <div className="h-full overflow-y-auto px-8 py-10 pb-32 max-w-3xl mx-auto">
                {view === 'entidades' && <EntitiesView />}
                {view === 'citas' && <QuotesView />}
                {view === 'relaciones' && <RelationshipsView />}
              </div>
            )}
          </>
        )}

        <ExtractBar
          busy={showProposal}
          onProposal={(text, proposal) => setPendingProposal({ text, proposal })}
        />
      </main>

      <div
        className={`${rightPanelOpen ? 'w-96' : 'w-0'} transition-[width] duration-200 overflow-hidden shrink-0`}
      >
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
  )
}

export default function App() {
  return (
    <StateProvider>
      <Shell />
    </StateProvider>
  )
}
