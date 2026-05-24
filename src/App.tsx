import { useCallback, useEffect, useState } from 'react'
import { useIsMobile } from './hooks/useIsMobile'
import { useSearchParamState } from './hooks/useSearchParamState'
import { startViewTransition } from './lib/viewTransition'
import {
  Provider,
  useEntitiesQuery,
  useOffline,
  useQuotesQuery,
  useRelationshipsQuery,
} from './state'
import { useTheme } from './hooks/useTheme'
import { useTimeOfDayAccent } from './hooks/useTimeOfDayAccent'
import { Sidebar, type ViewMode } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { CommandPalette } from './components/CommandPalette'
import { ShortcutsModal } from './components/ShortcutsModal'
import { Onboarding } from './components/Onboarding'
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
  // δ6: shift sutil del --accent-gold según hora local. La app se siente
  // distinta según cuándo entres — sin que el usuario tenga que pensarlo.
  useTimeOfDayAccent()

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
  // Sincronizado con `?entity=uuid` de la URL — permite copiar el link de
  // una entidad y compartirlo, o recargar la página manteniendo el panel
  // abierto. Internamente sigue siendo un state, pero ahora también vive
  // en la URL.
  const [selectedEntityId, _setSelectedEntityId] = useSearchParamState('entity')

  // Wrapper que pasa por la View Transitions API — el EntityRow en la
  // lista y el EntityHeader del panel tienen el mismo viewTransitionName,
  // así que el browser anima del card al header automáticamente. Si el
  // browser no soporta la API, el state cambia sin animación.
  const setSelectedEntityId = useCallback(
    (id: string | null) => {
      startViewTransition(() => _setSelectedEntityId(id))
    },
    [_setSelectedEntityId],
  )
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null)
  // Cuando el AskBar deep-linkea a chat con un thread específico.
  const [pendingChatThreadId, setPendingChatThreadId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [readingOpen, setReadingOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  // Focus mode — esconde sidebar, topbar y askbar. Solo queda el
  // contenido. Persiste en localStorage para que el usuario que
  // prefiere modo zen no tenga que activarlo cada sesión.
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('trama:focus-mode') === '1'
  })

  // Atajos globales:
  //   Cmd/Ctrl+K → CommandPalette
  //   ?          → ShortcutsModal (cheatsheet)
  //   \          → toggle focus mode (zen, como editores markdown)
  //
  // Para los que no usan modifiers (? y \) ignoramos cuando el foco
  // está en un input/textarea — no rompemos la escritura.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const inField =
        tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable
      if (inField) return

      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setShortcutsOpen((open) => !open)
        return
      }
      if (e.key === '\\' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setFocusMode((on) => {
          const next = !on
          try {
            window.localStorage.setItem('trama:focus-mode', next ? '1' : '0')
          } catch {
            /* storage disabled */
          }
          return next
        })
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
    <div
      className="h-screen w-screen flex overflow-hidden"
      data-focus-mode={focusMode || undefined}
    >
      {/* Sidebar — se oculta en focus mode para liberar todo el viewport
          al contenido. La animation se preserva al regresar de focus. */}
      {!focusMode && (
        <div className="animate-shell-sidebar shrink-0 h-full flex">
          <Sidebar
            view={view}
            onChangeView={(v) => {
              setView(v)
              if (v !== 'grafo') setSelectedEntityId(null)
            }}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
            offline={offline}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
      )}

      <main className="flex-1 relative overflow-hidden flex flex-col">
        {!focusMode && (
          <div className="animate-shell-topbar">
            <TopBar
              view={view}
              onOpenPalette={() => setPaletteOpen(true)}
              breadcrumb={
                // Si hay una entidad seleccionada y existe en cache,
                // muestra "View › Nombre" — orientación visual estilo
                // Codex (path-style) en lugar de solo el título de vista.
                showDetail && selectedEntityId
                  ? {
                      label:
                        entitiesQuery.data?.find((e) => e.id === selectedEntityId)?.name ??
                        'entidad',
                      onClickRoot: () => setSelectedEntityId(null),
                    }
                  : null
              }
            />
          </div>
        )}
        <div className="flex-1 relative overflow-hidden animate-shell-main">
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

          {/* Fade mask debajo del scroll — desvanece el contenido a
              paper-50 antes de llegar al AskBar. Sin esto el texto que
              cae al final se ve filtrarse detrás de la barra (que es
              semitransparente con backdrop-blur). Solo aparece donde
              hay AskBar visible. */}
          {!focusMode && view !== 'chat' && view !== 'grafo' && !(isMobile && rightPanelOpen) && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-b from-transparent via-paper-50/75 to-paper-50"
            />
          )}

          {!focusMode && view !== 'chat' && !(isMobile && rightPanelOpen) && (
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

        {/* Pill flotante de salida de focus mode — sin esto el usuario
            podría no saber cómo volver al shell completo. Discreto en
            la esquina superior derecha; click o tecla `\` para salir. */}
        {focusMode && (
          <button
            onClick={() => {
              setFocusMode(false)
              try {
                window.localStorage.setItem('trama:focus-mode', '0')
              } catch {
                /* storage disabled */
              }
            }}
            aria-label="Salir del modo focus"
            title="Salir del modo focus (\)"
            className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 bg-paper-50/90 hover:bg-paper-50 border border-ink-100/60 hover:border-ink-200 rounded-md backdrop-blur transition-colors animate-fade-up"
          >
            <span>focus</span>
            <kbd className="font-mono text-micro px-1.5 py-0.5 bg-paper-100 border border-ink-200/70 rounded text-ink-500 leading-none">
              \
            </kbd>
          </button>
        )}
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

      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      {/* Onboarding — solo aparece la primera vez, cuando la trama
          está literalmente vacía. El propio componente checa
          localStorage y se cierra si ya lo vio. */}
      <Onboarding
        enabled={
          !loading &&
          entitiesQuery.data?.length === 0 &&
          quotesQuery.data?.length === 0 &&
          relationshipsQuery.data?.length === 0
        }
        onComplete={() => {
          /* Persistencia y close manejados dentro del componente. */
        }}
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
  // El wrapper ya no usa shell-rise único — las animaciones de entrada
  // viven dentro de Shell, aplicadas a Sidebar / TopBar / Main con delays
  // escalonados (Z6 — page-load choreography).
  return (
    <Provider>
      <Splash />
      <ErrorBoundary>
        <div className="h-full">
          <Shell />
        </div>
      </ErrorBoundary>
    </Provider>
  )
}
