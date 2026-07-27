import { lazy, Suspense, type ReactNode } from 'react'
import { Spinner } from './Spinner'
import { ErrorBoundary, type ErrorFallbackProps } from './ErrorBoundary'
import { TramaMark } from './Icons'
import { CenteredPane } from './CenteredPane'
import { SectionPinGate } from './SectionPinGate'
import type { ViewMode } from '../types/view'
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
 * **Granular error boundaries**: cada vista vive dentro de su propio
 * ErrorBoundary, así un crash en (p. ej.) ChatView NO tira abajo
 * Sidebar/TopBar — el usuario puede cambiar de vista o reintentar sin
 * recargar la app. El ErrorBoundary raíz en App.tsx queda como red de
 * seguridad para crashes que escapan del boundary per-vista (Shell,
 * Sidebar, TopBar, providers).
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
const TwitterView = lazy(() =>
  import('./TwitterView').then((m) => ({ default: m.TwitterView })),
)
const MomentosView = lazy(() =>
  import('./MomentosView').then((m) => ({ default: m.MomentosView })),
)
const CronologiaView = lazy(() =>
  import('./CronologiaView').then((m) => ({ default: m.CronologiaView })),
)
const AtlasView = lazy(() =>
  import('./AtlasView').then((m) => ({ default: m.AtlasView })),
)
const ProactiveView = lazy(() =>
  import('./ProactiveView').then((m) => ({ default: m.ProactiveView })),
)

/** Fallback editorial para Suspense mientras la vista se descarga. */
export function ViewFallback() {
  return (
    <div
      className="view-fallback"
      role="status"
      aria-live="polite"
      aria-label="hilando vista"
    >
      <span className="view-fallback__loom" aria-hidden>
        <span className="view-fallback__thread view-fallback__thread--one" />
        <span className="view-fallback__thread view-fallback__thread--two" />
        <span className="view-fallback__thread view-fallback__thread--three" />
        <Spinner size={24} decorative />
      </span>
      <span className="font-serif italic text-sm text-ink-400">hilando vista…</span>
    </div>
  )
}

/**
 * Fallback inline para el ErrorBoundary per-vista. A diferencia del
 * fallback fullscreen (en ErrorBoundary.tsx), este se queda DENTRO del
 * contenedor de la vista — Sidebar y TopBar permanecen funcionales,
 * el usuario puede cambiar de vista para "salir" del crash.
 *
 * Muestra los mismos affordances (Recargar, Intentar de nuevo, copiar
 * detalles) que el fallback global, pero más chico y sin ocupar la
 * pantalla entera.
 */
function ViewErrorFallback({
  error,
  componentStack,
  onReset,
  onReload,
}: ErrorFallbackProps) {
  const details =
    `${error.name}: ${error.message}\n\n` +
    (error.stack ? `Stack:\n${error.stack}\n\n` : '') +
    (componentStack ? `Component stack:${componentStack}` : '')

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(details)
    } catch {
      /* navegador sin clipboard API o sin permiso — fallback silent */
    }
  }

  // Es la pantalla que aparece justo cuando algo ya falló: si además se
  // recortara, el usuario perdería los botones de recuperación. Con
  // `CenteredPane` el contenido siempre se puede alcanzar.
  return (
    <CenteredPane className="p-6">
      <div
        role="alert"
        className="max-w-md w-full bg-paper-50 border border-ink-100 rounded-xl shadow-lg shadow-ink-900/5 p-6"
      >
        <TramaMark size={18} className="text-ink-200 mb-2" />
        <p className="text-micro uppercase tracking-shout text-ink-300 mb-1.5">
          Vista interrumpida
        </p>
        <h2 className="font-serif text-lg text-ink-800 leading-tight mb-2">
          Esta vista se rompió.
        </h2>
        <p className="text-ink-500 text-body leading-relaxed mb-3">
          El resto de la app sigue andando — puedes cambiar de vista desde el lateral. Si
          quieres intentar de nuevo:
        </p>
        <details className="mb-4 group">
          <summary className="text-xs uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 cursor-pointer transition-colors">
            Detalles técnicos
          </summary>
          <pre className="mt-2 p-2.5 bg-ink-50 border border-ink-100 rounded-md text-caption text-ink-600 leading-relaxed overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
            {details}
          </pre>
        </details>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onReset} className="btn-ink text-xs">
            Intentar de nuevo
          </button>
          <button onClick={onReload} className="btn-ghost text-xs">
            Recargar la app
          </button>
          <button
            onClick={copyDetails}
            className="ml-auto text-xs uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
          >
            Copiar
          </button>
        </div>
      </div>
    </CenteredPane>
  )
}

/**
 * Combina ErrorBoundary + Suspense con el fallback inline de vista.
 * Centraliza el patrón para que cada uso en el switch quede compacto.
 */
function ViewSlot({ scope, children }: { scope: string; children: ReactNode }) {
  return (
    <ErrorBoundary scope={scope} fallback={(p) => <ViewErrorFallback {...p} />}>
      <Suspense fallback={<ViewFallback />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

function ViewTransition({
  view,
  layout = 'scroll',
  children,
}: {
  view: ViewMode
  layout?: 'scroll' | 'canvas'
  children: ReactNode
}) {
  const layoutClass =
    layout === 'canvas' ? 'relative h-full overflow-hidden' : 'min-h-full'

  return (
    <div
      className={`view-transition view-transition--${layout} ${layoutClass}`}
      data-testid="view-transition"
      data-view-transition={view}
      key={view}
    >
      {children}
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
  onOpenCareo,
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
  onOpenCareo?: () => void
  onProposal: (text: string, proposal: ExtractionProposal) => void
  onConsumedInitialThread: () => void
}) {
  if (view === 'grafo') {
    return (
      <SectionPinGate key={view} sectionId={view}>
        <ViewTransition view={view} layout="canvas">
          <ViewSlot scope="view:grafo">
            <GraphView
              selectedId={selectedEntityId}
              onSelect={onSelectEntity}
              onProposal={onProposal}
            />
          </ViewSlot>
        </ViewTransition>
      </SectionPinGate>
    )
  }

  if (view === 'chat') {
    return (
      <SectionPinGate key={view} sectionId={view}>
        <ViewTransition view={view} layout="canvas">
          <ViewSlot scope="view:chat">
            <ChatView
              initialThreadId={pendingChatThreadId}
              onConsumedInitialThread={onConsumedInitialThread}
            />
          </ViewSlot>
        </ViewTransition>
      </SectionPinGate>
    )
  }

  // El resto de vistas viven dentro de un contenedor scrolleable.
  // IMPORTANTE: el overflow-y-auto va en el contenedor EXTERIOR (full
  // width) para que el trackpad/scroll-wheel capture el evento en
  // cualquier parte del viewport, no sólo sobre el texto centrado.
  // El wrapper INTERIOR limita el ancho de lectura (max-w-3xl).
  return (
    <SectionPinGate key={view} sectionId={view}>
      <div
        id="main-scroll"
        className="h-full overflow-y-auto"
        tabIndex={0}
        aria-label="Contenido principal"
      >
        <ViewTransition view={view}>
          <div
            className="px-8 py-10 max-w-3xl mx-auto"
            // El AskBar flota sobre este scroller y publica su alto real en
            // `--askbar-h` (ver AskBar.tsx). Reservarlo aquí es lo que
            // garantiza que el final de la vista siempre se pueda scrollear
            // por encima de la barra; el `pb-32` fijo que había antes se
            // quedaba corto en cuanto la barra crecía. Sin AskBar la variable
            // no existe y queda sólo el respiro de cierre.
            style={{ paddingBottom: 'calc(var(--askbar-h, 0px) + 2.5rem)' }}
          >
            {view === 'inicio' && (
              <ErrorBoundary
                scope="view:inicio"
                fallback={(p) => <ViewErrorFallback {...p} />}
              >
                <HomeView onNavigate={onChangeView} onSelectEntity={onSelectEntity} />
              </ErrorBoundary>
            )}
            {view === 'entidades' && (
              <ViewSlot scope="view:entidades">
                <EntitiesWorkbench
                  onSelectEntity={onSelectEntity}
                  onProposal={onProposal}
                  tab={entitiesTab}
                  onTabChange={onEntitiesTabChange}
                />
              </ViewSlot>
            )}
            {view === 'citas' && (
              <ViewSlot scope="view:citas">
                <QuotesView onSelectEntity={onSelectEntity} onOpenCareo={onOpenCareo} />
              </ViewSlot>
            )}
            {view === 'escuchas' && (
              <ViewSlot scope="view:escuchas">
                <ListeningView onSelectEntity={onSelectEntity} onProposal={onProposal} />
              </ViewSlot>
            )}
            {view === 'twitter' && (
              <ViewSlot scope="view:twitter">
                <TwitterView onProposal={onProposal} />
              </ViewSlot>
            )}
            {view === 'momentos' && (
              <ViewSlot scope="view:momentos">
                <MomentosView />
              </ViewSlot>
            )}
            {view === 'cronologia' && (
              <ViewSlot scope="view:cronologia">
                <CronologiaView onSelectEntity={onSelectEntity} />
              </ViewSlot>
            )}
            {view === 'atlas' && (
              <ViewSlot scope="view:atlas">
                <AtlasView onSelectEntity={onSelectEntity} />
              </ViewSlot>
            )}
            {view === 'sugerencias' && (
              <ViewSlot scope="view:sugerencias">
                <ProactiveView />
              </ViewSlot>
            )}
          </div>
        </ViewTransition>
      </div>
    </SectionPinGate>
  )
}
