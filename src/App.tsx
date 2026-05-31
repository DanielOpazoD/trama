import { useCallback, useEffect, useState } from 'react'
import { useIsMobile } from './hooks/useIsMobile'
import { useSearchParamState } from './hooks/useSearchParamState'
import { useInitialView } from './hooks/useInitialView'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { startViewTransition } from './lib/viewTransition'
import { readOAuthReturn, clearOAuthReturn, type OAuthReturn } from './lib/oauthReturn'
import {
  Provider,
  useEntitiesQuery,
  useOffline,
  useQuotesQuery,
  useRelationshipsQuery,
} from './state'
import { useTheme } from './hooks/useTheme'
import { useTimeOfDayAccent } from './hooks/useTimeOfDayAccent'
import { useAchievements } from './hooks/useAchievements'
import { useWeeklyProactiveNudge } from './hooks/useWeeklyProactiveNudge'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { CommandPalette } from './components/CommandPalette'
import { ShortcutsModal } from './components/ShortcutsModal'
import { Onboarding } from './components/Onboarding'
import { ToastHost } from './components/ToastHost'
import { PreviewBanner } from './components/PreviewBanner'
import { AskBar } from './components/AskBar'
import { ReadingMode } from './components/ReadingMode'
import { Sortes } from './components/Sortes'
import { Espejo } from './components/Espejo'
import { Settings } from './components/Settings'
import { Splash } from './components/Splash'
import { HomeSkeleton } from './components/HomeSkeleton'
import { ErrorBoundary } from './components/ErrorBoundary'
import { RightPanel, type PendingProposal } from './components/RightPanel'
import { ViewRouter } from './components/ViewRouter'
import { AuthGate } from './components/AuthGate'
import { AppPinGate } from './components/AppPinGate'
import { MobileBottomNav } from './components/MobileBottomNav'
import { SectionAccentBand } from './components/SectionAccentBand'
import { NotasWorld } from './components/notas/NotasWorld'
import { DEFAULT_WORLD, WORLD_STORAGE_KEY, type World } from './types/world'
// GlobalProgressBar removido por feedback del usuario — la barra fina
// que latía con cada query se percibía como molesta. Si en el futuro
// queremos mostrar progreso global, considerar un patrón más sutil
// (puntito en el TopBar, sin animación continua).

/**
 * El shell de la app: monta sidebar + topbar + main + paneles flotantes
 * (settings, palette, toast, right panel).
 *
 * El switch de vistas vive en `ViewRouter` y el panel lateral en
 * `RightPanel`, para que este archivo se enfoque solo en orquestar
 * state global (vista activa, entidad seleccionada, propuesta pendiente,
 * apertura de settings/palette/reading) y atajos de teclado.
 */
function Shell({
  world,
  onChangeWorld,
}: {
  world: World
  onChangeWorld: (w: World) => void
}) {
  const entitiesQuery = useEntitiesQuery()
  const relationshipsQuery = useRelationshipsQuery()
  const quotesQuery = useQuotesQuery()
  const { offline } = useOffline()
  const { theme, setTheme } = useTheme()
  // δ6: shift sutil del --accent-gold según hora local. La app se siente
  // distinta según cuándo entres — sin que el usuario tenga que pensarlo.
  useTimeOfDayAccent()
  // δ7: achievement moments — un toast efímero cuando cruzás un umbral
  // (10, 25, 50, 100, 250… entidades/citas/relaciones). Lee de las
  // queries cacheadas; las llamadas que ya están arriba alimentan esto.
  useAchievements({
    entities: entitiesQuery.data?.length ?? 0,
    quotes: quotesQuery.data?.length ?? 0,
    relationships: relationshipsQuery.data?.length ?? 0,
  })

  const loading =
    entitiesQuery.isLoading || relationshipsQuery.isLoading || quotesQuery.isLoading
  const error =
    entitiesQuery.error?.message ??
    relationshipsQuery.error?.message ??
    quotesQuery.error?.message ??
    null

  const isMobile = useIsMobile()
  // τ-mobile-bridge: vive en useInitialView — lee `?view=` al primer
  // render (deep-links externos como el QR de Momentos) y envuelve el
  // setter con la View Transitions API. Ver el hook para detalles.
  const [view, setView] = useInitialView()
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
  // ρ-struct: tab activo de Entidades — vive en App para que TopBar
  // pueda exponerlo como tabs contextuales. Antes era state local de
  // EntitiesWorkbench; ahora controlado desde acá.
  const [entitiesTab, setEntitiesTab] = useState<'listado' | 'vinculos'>('listado')
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Retorno de un OAuth (X / Spotify): el callback redirige acá con
  // `?x=connected` o `?x_error=...`. Lo leemos una vez al montar, abrimos
  // Settings en el panel correcto y limpiamos la URL. Antes esto era invisible.
  const [oauthReturn, setOauthReturn] = useState<OAuthReturn | null>(() =>
    readOAuthReturn(),
  )
  const [readingOpen, setReadingOpen] = useState(false)
  const [sortesOpen, setSortesOpen] = useState(false)
  const [espejoOpen, setEspejoOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  // Focus mode — esconde sidebar, topbar y askbar. Solo queda el
  // contenido. Persiste en localStorage para que el usuario que
  // prefiere modo zen no tenga que activarlo cada sesión.
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('trama:focus-mode') === '1'
  })

  // κ2: nudge semanal cuando hay sugerencias proactivas pendientes y
  // ya pasaron 7+ días desde el último toast. La declaración va aquí
  // porque depende de setView (defined arriba) para el CTA.
  const navigateToProactive = useCallback(() => {
    setView('sugerencias')
  }, [setView])
  useWeeklyProactiveNudge({ onNavigate: navigateToProactive })

  // Si volvimos de un OAuth (X / Spotify), abrir Settings para que el usuario
  // vea el resultado en el panel correspondiente, y limpiar la URL. El panel
  // muestra el detalle (y el código de error si falló). Corre una sola vez.
  useEffect(() => {
    if (oauthReturn) {
      setSettingsOpen(true)
      clearOAuthReturn()
    }
  }, [oauthReturn])

  const toggleFocusMode = useCallback(() => {
    setFocusMode((on) => {
      const next = !on
      try {
        window.localStorage.setItem('trama:focus-mode', next ? '1' : '0')
      } catch {
        /* storage disabled */
      }
      return next
    })
  }, [])
  useGlobalShortcuts({
    onTogglePalette: () => setPaletteOpen((open) => !open),
    onOpenPalette: () => setPaletteOpen(true),
    onToggleShortcuts: () => setShortcutsOpen((open) => !open),
    onToggleFocusMode: toggleFocusMode,
  })

  const showProposal = pendingProposal !== null
  // El panel de detalle se puede abrir desde cualquier vista (graph, entidades,
  // citas) — no es exclusivo del grafo.
  const showDetail = !showProposal && selectedEntityId !== null
  const rightPanelOpen = showProposal || showDetail

  return (
    // τ-worlds: el Shell del mundo Trama llena su columna dentro de WorldShell
    // (antes era h-screen/w-screen porque era la raíz; ahora el riel de mundos
    // vive a su izquierda).
    <div
      className="h-full w-full flex flex-col md:flex-row overflow-hidden"
      data-focus-mode={focusMode || undefined}
    >
      {/* DD1: banner amarillo en deploy previews — la BD del preview es
          una rama ephemeral, los cambios no llegan a producción. */}
      <PreviewBanner />
      {/* Sidebar — se oculta en focus mode para liberar todo el viewport
          al contenido. En mobile el sidebar también se oculta; en su
          lugar montamos la MobileBottomNav abajo. */}
      {!focusMode && !isMobile && (
        <div className="animate-shell-sidebar shrink-0 h-full flex">
          <Sidebar
            view={view}
            onChangeView={(v) => {
              setView(v)
              if (v !== 'grafo') setSelectedEntityId(null)
            }}
            world={world}
            onChangeWorld={onChangeWorld}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
            offline={offline}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenPalette={() => setPaletteOpen(true)}
          />
        </div>
      )}

      <main className="flex-1 relative overflow-hidden flex flex-col">
        {!focusMode && (
          <div className="animate-shell-topbar">
            <TopBar
              view={view}
              onSortes={() => setSortesOpen(true)}
              breadcrumb={
                // Si hay una entidad seleccionada y existe en cache,
                // muestra "View › Nombre" — orientación visual estilo
                // Codex (path-style) en lugar de solo el título de vista.
                showDetail && selectedEntityId
                  ? {
                      label:
                        entitiesQuery.data?.find((e) => e.id === selectedEntityId)
                          ?.name ?? 'entidad',
                      onClickRoot: () => setSelectedEntityId(null),
                    }
                  : null
              }
              tabs={
                // ρ-struct: tabs contextuales para la vista activa.
                // Por ahora solo Entidades tiene tabs (Listado/Vínculos).
                // Si más adelante otra vista necesita tabs, se agrega un
                // branch acá.
                view === 'entidades'
                  ? {
                      items: [
                        { value: 'listado', label: 'Listado' },
                        { value: 'vinculos', label: 'Vínculos' },
                      ],
                      active: entitiesTab,
                      onChange: (v) => setEntitiesTab(v as 'listado' | 'vinculos'),
                      'aria-label': 'Sub-secciones de Entidades',
                    }
                  : null
              }
            />
            {/* Section accent band — banda 2px del color de la vista activa. */}
            <SectionAccentBand view={view} />
          </div>
        )}
        <div className="flex-1 relative overflow-hidden animate-shell-main">
          {error && (
            <div className="alert-error absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 text-sm shadow-md z-10">
              {error}
            </div>
          )}

          {loading ? (
            // ω-C: skeleton específico para la vista Inicio. Para otras
            // vistas (entidades / citas / etc.) mantenemos el placeholder
            // genérico — cada una tiene su propio loading inline en su
            // primer render. Solo Inicio se beneficia de un skeleton
            // dedicado porque su hero define el carácter editorial.
            view === 'inicio' ? (
              <HomeSkeleton />
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-ink-300 italic">cargando…</p>
              </div>
            )
          ) : (
            <div key={view} className="animate-view-fade h-full">
              <ViewRouter
                view={view}
                selectedEntityId={selectedEntityId}
                pendingChatThreadId={pendingChatThreadId}
                entitiesTab={entitiesTab}
                onEntitiesTabChange={setEntitiesTab}
                onSelectEntity={setSelectedEntityId}
                onChangeView={setView}
                onProposal={(text, proposal) => setPendingProposal({ text, proposal })}
                onConsumedInitialThread={() => setPendingChatThreadId(null)}
                onSortes={() => setSortesOpen(true)}
                onEspejo={() => setEspejoOpen(true)}
              />
            </div>
          )}

          {/* Fade mask debajo del scroll — desvanece el contenido a
              paper-50 antes de llegar al AskBar. Sin esto el texto que
              cae al final se ve filtrarse detrás de la barra (que es
              semitransparente con backdrop-blur). Solo aparece donde
              hay AskBar visible. */}
          {!focusMode &&
            view !== 'chat' &&
            view !== 'grafo' &&
            !(isMobile && rightPanelOpen) && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-b from-transparent via-paper-50/75 to-paper-50"
              />
            )}

          {/* ρ-consistency: AskBar oculto en Grafo (tapa nodos) y Chat
              (la conversación tiene su propio input). Antes solo se
              ocultaba en Chat — en Grafo competía con los nodos centrales
              y forzaba a scrollear o esconder lo más interesante. */}
          {!focusMode &&
            view !== 'chat' &&
            view !== 'grafo' &&
            !(isMobile && rightPanelOpen) && (
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
            className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 section-eyebrow hover:text-ink-700 bg-paper-50/90 hover:bg-paper-50 border border-ink-100/60 hover:border-ink-200 rounded-md backdrop-blur transition-colors animate-fade-up"
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
        onClose={() => {
          setSettingsOpen(false)
          setOauthReturn(null)
        }}
        theme={theme}
        onSetTheme={setTheme}
        initialSection={oauthReturn?.provider}
        oauthReturn={oauthReturn}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(v) => setView(v)}
        onSelectEntity={(id) => setSelectedEntityId(id)}
        onOpenThread={(threadId) => {
          setPendingChatThreadId(threadId)
          setView('chat')
        }}
        onAction={(action) => {
          // Las acciones rápidas del palette se traducen en navigations
          // + modal openings. "Nueva X" navega a la vista correspondiente;
          // el form se abrirá manualmente o vía un futuro hint.
          switch (action) {
            case 'open-settings':
              setSettingsOpen(true)
              break
            case 'open-shortcuts':
              setShortcutsOpen(true)
              break
            case 'open-sortes':
              setSortesOpen(true)
              break
            case 'open-espejo':
              setEspejoOpen(true)
              break
            case 'new-entity':
              setView('entidades')
              break
            case 'new-quote':
              setView('citas')
              break
            case 'new-momento':
              setView('momentos')
              break
          }
        }}
      />

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Sortes — segunda lectura: una cita al azar del propio archivo, a
          pantalla completa. Se abre desde el TopBar o el command palette. */}
      <Sortes open={sortesOpen} onClose={() => setSortesOpen(false)} />

      {/* Espejo — la composición de la trama como un retrato, no un panel. */}
      <Espejo open={espejoOpen} onClose={() => setEspejoOpen(false)} />

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

      {/* Mobile bottom nav — solo aparece en viewports < md. En focus
          mode también se oculta para no competir con el contenido.
          Cuando el RightPanel está abierto en mobile (bottom-sheet),
          el nav se oculta también — el sheet ya ocupa toda la atención
          y el nav competiría con su borde inferior. */}
      {!focusMode && isMobile && !rightPanelOpen && (
        <MobileBottomNav
          view={view}
          onChangeView={(v) => {
            setView(v)
            if (v !== 'grafo') setSelectedEntityId(null)
          }}
        />
      )}

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

/**
 * τ-worlds: envuelve los mundos de Trama. El WorldRail (riel fijo a la
 * izquierda) conmuta entre workspaces; cada mundo monta su propio shell.
 * 'trama' = el mundo histórico (Shell, el mapa cognitivo); 'notas' = Trama
 * Notas. El mundo activo persiste en localStorage. Es el único nivel por
 * encima del Shell — todo lo de la Trama sigue intacto adentro de Shell.
 */
function WorldShell() {
  const [world, setWorld] = useState<World>(() => {
    if (typeof window === 'undefined') return DEFAULT_WORLD
    const saved = window.localStorage.getItem(WORLD_STORAGE_KEY)
    return saved === 'notas' || saved === 'trama' ? (saved as World) : DEFAULT_WORLD
  })
  const changeWorld = useCallback((w: World) => {
    setWorld(w)
    try {
      window.localStorage.setItem(WORLD_STORAGE_KEY, w)
    } catch {
      /* storage deshabilitado */
    }
  }, [])

  // El conmutador de mundos vive en el logo (WorldSwitcher), dentro del header
  // de cada mundo — por eso acá no hay riel: se monta el mundo activo a pantalla
  // completa y se le pasa el control de cambio de mundo.
  return (
    <div className="h-screen w-screen overflow-hidden">
      {world === 'trama' ? (
        <Shell world={world} onChangeWorld={changeWorld} />
      ) : (
        <NotasWorld world={world} onChangeWorld={changeWorld} />
      )}
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
    <AuthGate>
      <AppPinGate>
        <Provider>
          <Splash />
          <ErrorBoundary>
            <div className="h-full">
              <WorldShell />
            </div>
          </ErrorBoundary>
        </Provider>
      </AppPinGate>
    </AuthGate>
  )
}
