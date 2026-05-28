import { lazy, Suspense } from 'react'
import { LoadingHint } from './LoadingHint'
import type { ViewMode } from './Sidebar'
import type { ExtractionProposal } from '../types'

/**
 * Despacha el contenido principal según la vista activa.
 *
 * **Code splitting**: cada vista pesada (>300 LOC y/o con dependencias
 * grandes — TanStack Query hooks, Sigma, prompts LLM, etc.) se carga
 * con `React.lazy` la primera vez que el usuario navega a ella. Antes
 * todas se incluían en el bundle inicial; con lazy el bundle de Inicio
 * baja ~25-30 KB gz y el resto se descarga on-demand al primer click.
 *
 * HomeView NO es lazy: es la primera vista que ve el usuario, lazearla
 * agrega un flash de loader innecesario.
 *
 * GraphView y ChatView son full-canvas (no usan el contenedor scroll-y);
 * el resto vive dentro de un main-scroll con max-w-3xl.
 */
import { HomeView } from './HomeView'

const GraphView = lazy(() => import('./GraphView'))
const ChatView = lazy(() => import('./ChatView').then((m) => ({ default: m.ChatView })))
const EntitiesWorkbench = lazy(() =>
  import('./EntitiesWorkbench').then((m) => ({ default: m.EntitiesWorkbench })),
)
const QuotesView = lazy(() =>
  import('./QuotesView').then((m) => ({ default: m.QuotesView })),
)
const ListeningView = lazy(() =>
  import('./ListeningView').then((m) => ({ default: m.ListeningView })),
)
const MomentosView = lazy(() =>
  import('./MomentosView').then((m) => ({ default: m.MomentosView })),
)
const ProactiveView = lazy(() =>
  import('./ProactiveView').then((m) => ({ default: m.ProactiveView })),
)

/** Fallback minimal para Suspense — un LoadingHint centrado mientras
 *  la vista se descarga. La mayoría de las vistas tardan <150ms, así
 *  que el flash es apenas perceptible. */
function ViewFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <LoadingHint text="cargando vista" size="sm" />
    </div>
  )
}

export function ViewRouter({
  view,
  selectedEntityId,
  pendingChatThreadId,
  entitiesTab,
  onEntitiesTabChange,
  onSelectEntity,
  onChangeView,
  onProposal,
  onConsumedInitialThread,
}: {
  view: ViewMode
  selectedEntityId: string | null
  pendingChatThreadId: string | null
  /** ρ-struct: tab activo de Entidades, controlado desde App para que
      TopBar pueda exponerlo como tabs contextuales. */
  entitiesTab: 'listado' | 'vinculos'
  onEntitiesTabChange: (tab: 'listado' | 'vinculos') => void
  onSelectEntity: (id: string | null) => void
  onChangeView: (v: ViewMode) => void
  onProposal: (text: string, proposal: ExtractionProposal) => void
  onConsumedInitialThread: () => void
}) {
  if (view === 'grafo') {
    return (
      <Suspense fallback={<ViewFallback />}>
        <GraphView
          selectedId={selectedEntityId}
          onSelect={onSelectEntity}
          onProposal={onProposal}
        />
      </Suspense>
    )
  }

  if (view === 'chat') {
    return (
      <Suspense fallback={<ViewFallback />}>
        <ChatView
          initialThreadId={pendingChatThreadId}
          onConsumedInitialThread={onConsumedInitialThread}
        />
      </Suspense>
    )
  }

  // El resto de vistas viven dentro de un contenedor scrolleable.
  // IMPORTANTE: el overflow-y-auto va en el contenedor EXTERIOR (full
  // width) para que el trackpad/scroll-wheel capture el evento en
  // cualquier parte del viewport, no sólo sobre el texto centrado.
  // El wrapper INTERIOR limita el ancho de lectura (max-w-3xl).
  return (
    <div id="main-scroll" className="h-full overflow-y-auto">
      <div className="px-8 py-10 pb-32 max-w-3xl mx-auto">
        {view === 'inicio' && (
          <HomeView onNavigate={onChangeView} onSelectEntity={onSelectEntity} />
        )}
        {view === 'entidades' && (
          <Suspense fallback={<ViewFallback />}>
            <EntitiesWorkbench
              onSelectEntity={onSelectEntity}
              onProposal={onProposal}
              tab={entitiesTab}
              onTabChange={onEntitiesTabChange}
            />
          </Suspense>
        )}
        {view === 'citas' && (
          <Suspense fallback={<ViewFallback />}>
            <QuotesView onSelectEntity={onSelectEntity} />
          </Suspense>
        )}
        {view === 'escuchas' && (
          <Suspense fallback={<ViewFallback />}>
            <ListeningView
              onSelectEntity={onSelectEntity}
              onProposal={onProposal}
            />
          </Suspense>
        )}
        {view === 'momentos' && (
          <Suspense fallback={<ViewFallback />}>
            <MomentosView />
          </Suspense>
        )}
        {view === 'sugerencias' && (
          <Suspense fallback={<ViewFallback />}>
            <ProactiveView />
          </Suspense>
        )}
      </div>
    </div>
  )
}
