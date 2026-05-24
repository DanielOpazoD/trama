import { ChatView } from './ChatView'
import { EntitiesView } from './EntitiesView'
import GraphView from './GraphView'
import { HomeView } from './HomeView'
import { ListeningView } from './ListeningView'
import { MomentosView } from './MomentosView'
import { ProactiveView } from './ProactiveView'
import { QuotesView } from './QuotesView'
import { RelationshipsView } from './RelationshipsView'
import type { ViewMode } from './Sidebar'
import type { ExtractionProposal } from '../types'

/**
 * Despacha el contenido principal según la vista activa.
 *
 * GraphView y ChatView son full-canvas (no usan el contenedor scroll-y);
 * el resto vive dentro de un main-scroll con max-w-3xl. Esa diferencia
 * está acá adentro para que App.tsx solo le pase `view` y callbacks.
 */
export function ViewRouter({
  view,
  selectedEntityId,
  pendingChatThreadId,
  onSelectEntity,
  onChangeView,
  onProposal,
  onConsumedInitialThread,
}: {
  view: ViewMode
  selectedEntityId: string | null
  pendingChatThreadId: string | null
  onSelectEntity: (id: string | null) => void
  onChangeView: (v: ViewMode) => void
  onProposal: (text: string, proposal: ExtractionProposal) => void
  onConsumedInitialThread: () => void
}) {
  if (view === 'grafo') {
    return (
      <GraphView
        selectedId={selectedEntityId}
        onSelect={onSelectEntity}
        onProposal={onProposal}
      />
    )
  }

  if (view === 'chat') {
    return (
      <ChatView
        initialThreadId={pendingChatThreadId}
        onConsumedInitialThread={onConsumedInitialThread}
      />
    )
  }

  // El resto de vistas viven dentro de un contenedor scrolleable con
  // ancho acotado, para que la lectura no compita con el grafo a pantalla
  // completa.
  return (
    <div
      id="main-scroll"
      className="h-full overflow-y-auto px-8 py-10 pb-32 max-w-3xl mx-auto"
    >
      {view === 'inicio' && (
        <HomeView onNavigate={onChangeView} onSelectEntity={onSelectEntity} />
      )}
      {view === 'entidades' && <EntitiesView onSelectEntity={onSelectEntity} />}
      {view === 'citas' && <QuotesView onSelectEntity={onSelectEntity} />}
      {view === 'relaciones' && (
        <RelationshipsView onSelectEntity={onSelectEntity} onProposal={onProposal} />
      )}
      {view === 'escuchas' && (
        <ListeningView onSelectEntity={onSelectEntity} onProposal={onProposal} />
      )}
      {view === 'momentos' && <MomentosView />}
      {view === 'sugerencias' && <ProactiveView />}
    </div>
  )
}
