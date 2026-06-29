import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useIsMobile } from './hooks/useIsMobile'
import { useInitialView } from './hooks/useInitialView'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { startViewTransition } from './lib/viewTransition'
import { clearOAuthReturn } from './lib/oauthReturn'
import {
  Provider,
  readUserPrefsMirror,
  clearUserPrefsMirror,
  useCountsQuery,
  useMomentoShareInvitationsQuery,
  useOffline,
  useRespondMomentoShareInvitation,
  useToast,
} from './state'
import { useCurrentClientUserId } from './lib/clientIdentity'
import { useTheme } from './hooks/useTheme'
import { useWorldThemeClass } from './hooks/useWorldThemeClass'
import { useTimeOfDayAccent } from './hooks/useTimeOfDayAccent'
import { useAchievements } from './hooks/useAchievements'
import { useWeeklyProactiveNudge } from './hooks/useWeeklyProactiveNudge'
import { useAppModals } from './hooks/useAppModals'
import { useShellState } from './hooks/useShellState'
import { Sidebar } from './components/Sidebar'
import { Onboarding } from './components/Onboarding'
import { ToastHost } from './components/ToastHost'
import { PreviewBanner } from './components/PreviewBanner'
import { Splash } from './components/Splash'
import { ErrorBoundary } from './components/ErrorBoundary'
import { RightPanel } from './components/RightPanel'
import { ViewRouter } from './components/ViewRouter'
import { AuthGate } from './components/AuthGate'
import { AppPinGate } from './components/AppPinGate'
import { ShellOverlays } from './components/ShellOverlays'
import { MomentoNotificationsCenter } from './components/momentos/MomentoNotificationsCenter'
import { ShellTopChrome } from './components/appShell/ShellTopChrome'
import { ShellAttentionLayer } from './components/appShell/ShellAttentionLayer'
import { buildShellVisibility } from './components/appShell/appShellModel'
import { WorldLoadingFallback } from './components/appShell/WorldLoadingFallback'
// NotasWorld es un mundo entero (feed unificado, PDF Studio, ajustes):
// se carga con lazy para no inflar el bundle `index` del mundo Trama, que es la
// primera pantalla. El usuario sólo lo descarga al conmutar al mundo Notas.
const loadNotasWorld = () =>
  import('./components/notas/NotasWorld').then((m) => ({ default: m.NotasWorld }))
const NotasWorld = lazy(loadNotasWorld)
import { type NotasSection } from './types/notas'
import {
  readNotasSectionDeepLinkFromSearch,
  readWorldDeepLinkFromSearch,
  resolveRecortesRedirectSearch,
} from './lib/worldShellRouting'
import type { CommandAction } from './components/CommandPalette'

import { DEFAULT_WORLD, WORLD_STORAGE_KEY, type World } from './types/world'

function preloadWorldBundle(world: World): void {
  if (world === 'notas') void loadNotasWorld()
}

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
  onRevealNotasModule,
}: {
  world: World
  onChangeWorld: (w: World) => void
  /** Revelar/abrir un módulo del mundo Notas desde el ⌘K (cruza de mundo). */
  onRevealNotasModule: (moduleId: NotasSection) => void
}) {
  const countsQuery = useCountsQuery()
  const shareInvitationsQuery = useMomentoShareInvitationsQuery()
  const respondShareInvitation = useRespondMomentoShareInvitation()
  const toast = useToast()
  const { offline } = useOffline()
  const { theme, setTheme } = useTheme()
  // δ6: shift sutil del --accent-gold según hora local. La app se siente
  // distinta según cuándo entres — sin que el usuario tenga que pensarlo.
  useTimeOfDayAccent()
  // δ7: achievement moments — un toast efímero cuando cruzás un umbral
  // (10, 25, 50, 100, 250… entidades/citas/relaciones). Usa /api/counts
  // para no cargar listas completas en el shell.
  useAchievements({
    entities: countsQuery.data?.entities ?? 0,
    quotes: countsQuery.data?.quotes ?? 0,
    relationships: countsQuery.data?.relationships ?? 0,
  })

  const isMobile = useIsMobile()
  // τ-mobile-bridge: vive en useInitialView — lee `?view=` al primer
  // render (deep-links externos como el QR de Momentos) y envuelve el
  // setter con la View Transitions API. Ver el hook para detalles.
  const [view, setView] = useInitialView()
  const handleWorldIntent = useCallback((targetWorld: World) => {
    preloadWorldBundle(targetWorld)
  }, [])
  // Estado de UI del Shell (selección, propuesta, thread, tab, focus mode,
  // sidebar, retorno OAuth + derivados de visibilidad del panel) en un hook
  // cohesivo. La vista solo lo cablea a sus piezas.
  const {
    sidebarCollapsed,
    setSidebarCollapsed,
    selectedEntityId,
    setSelectedEntityId,
    pendingProposal,
    setPendingProposal,
    pendingChatThreadId,
    setPendingChatThreadId,
    entitiesTab,
    setEntitiesTab,
    oauthReturn,
    setOauthReturn,
    focusMode,
    toggleFocusMode,
    exitFocusMode,
    showProposal,
    showDetail,
    rightPanelOpen,
  } = useShellState()
  const modals = useAppModals()
  const { openModal } = modals

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
      openModal('settings')
      clearOAuthReturn()
    }
  }, [oauthReturn, openModal])

  useGlobalShortcuts({
    onTogglePalette: () => modals.toggleModal('palette'),
    onOpenPalette: () => modals.openModal('palette'),
    onToggleShortcuts: () => modals.toggleModal('shortcuts'),
    onToggleFocusMode: toggleFocusMode,
  })

  const shareInvitations = shareInvitationsQuery.data?.items ?? []
  const shellVisibility = buildShellVisibility({
    focusMode,
    isMobile,
    rightPanelOpen,
    view,
  })

  async function handleShareInvitationResponse(id: string, action: 'accept' | 'reject') {
    try {
      await respondShareInvitation.mutateAsync({ id, action })
      toast.show({
        message:
          action === 'accept'
            ? 'Momentos compartidos agregados.'
            : 'Invitación rechazada.',
        tone: action === 'accept' ? 'success' : 'default',
      })
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo responder',
        tone: 'error',
      })
    }
  }
  const handlePaletteAction = useCallback(
    (action: CommandAction) => {
      // Las acciones rápidas del palette se traducen en navigations
      // + modal openings. "Nueva X" navega a la vista correspondiente;
      // el form se abrirá manualmente o vía un futuro hint.
      switch (action) {
        case 'open-settings':
          modals.openModal('settings')
          break
        case 'open-shortcuts':
          modals.openModal('shortcuts')
          break
        case 'open-sortes':
          modals.openModal('sortes')
          break
        case 'open-espejo':
          modals.openModal('espejo')
          break
        case 'open-careo':
          modals.openModal('careo')
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
    },
    [modals, setView],
  )

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
      {shellVisibility.desktopSidebar && (
        <div className="animate-shell-sidebar shrink-0 h-full flex">
          <Sidebar
            view={view}
            onChangeView={(v) => {
              setView(v)
              if (v !== 'grafo') setSelectedEntityId(null)
            }}
            world={world}
            onChangeWorld={onChangeWorld}
            onWorldIntent={handleWorldIntent}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
            offline={offline}
            onOpenSettings={() => modals.openModal('settings')}
            onOpenPalette={() => modals.openModal('palette')}
          />
        </div>
      )}

      <main className="flex-1 relative overflow-hidden flex flex-col">
        <ShellTopChrome
          visibility={shellVisibility}
          view={view}
          world={world}
          rightPanelOpen={rightPanelOpen}
          showDetail={showDetail}
          selectedEntityId={selectedEntityId}
          entitiesTab={entitiesTab}
          actions={
            <MomentoNotificationsCenter
              invitations={shareInvitations}
              pending={respondShareInvitation.isPending}
              onRespond={handleShareInvitationResponse}
            />
          }
          onChangeWorld={onChangeWorld}
          onWorldIntent={handleWorldIntent}
          onChangeView={(v) => {
            setView(v)
            if (v !== 'grafo') setSelectedEntityId(null)
          }}
          onOpenSortes={() => modals.openModal('sortes')}
          onClearSelectedEntity={() => setSelectedEntityId(null)}
          onEntitiesTabChange={setEntitiesTab}
        />
        <div className="flex-1 relative overflow-hidden animate-shell-main">
          <div key={view} className="animate-view-fade h-full">
            <ViewRouter
              view={view}
              selectedEntityId={selectedEntityId}
              pendingChatThreadId={pendingChatThreadId}
              entitiesTab={entitiesTab}
              onEntitiesTabChange={setEntitiesTab}
              onSelectEntity={setSelectedEntityId}
              onChangeView={setView}
              onOpenCareo={() => modals.openModal('careo')}
              onProposal={(text, proposal) => setPendingProposal({ text, proposal })}
              onConsumedInitialThread={() => setPendingChatThreadId(null)}
            />
          </div>

          <ShellAttentionLayer
            visibility={shellVisibility}
            focusMode={focusMode}
            view={view}
            selectedEntityId={selectedEntityId}
            showProposal={showProposal}
            readingOpen={modals.reading}
            onProposal={(text, proposal) => setPendingProposal({ text, proposal })}
            onOpenThread={(threadId) => {
              setPendingChatThreadId(threadId)
              setView('chat')
            }}
            onOpenReading={() => modals.openModal('reading')}
            onCloseReading={() => modals.closeModal('reading')}
            onExitFocusMode={exitFocusMode}
          />
        </div>
      </main>

      <ShellOverlays
        settingsOpen={modals.settings}
        onCloseSettings={() => {
          modals.closeModal('settings')
          setOauthReturn(null)
        }}
        theme={theme}
        onSetTheme={setTheme}
        oauthReturn={oauthReturn}
        paletteOpen={modals.palette}
        onClosePalette={() => modals.closeModal('palette')}
        onNavigate={(v) => setView(v)}
        onSelectEntity={(id) => setSelectedEntityId(id)}
        onOpenThread={(threadId) => {
          setPendingChatThreadId(threadId)
          setView('chat')
        }}
        onRevealNotasModule={onRevealNotasModule}
        onPaletteAction={handlePaletteAction}
        shortcutsOpen={modals.shortcuts}
        onCloseShortcuts={() => modals.closeModal('shortcuts')}
        sortesOpen={modals.sortes}
        onCloseSortes={() => modals.closeModal('sortes')}
        espejoOpen={modals.espejo}
        onCloseEspejo={() => modals.closeModal('espejo')}
        careoOpen={modals.careo}
        onCloseCareo={() => modals.closeModal('careo')}
      />

      {/* Onboarding — solo aparece la primera vez, cuando la trama
          está literalmente vacía. El propio componente checa
          localStorage y se cierra si ya lo vio. */}
      <Onboarding
        enabled={
          !countsQuery.isLoading &&
          countsQuery.data?.entities === 0 &&
          countsQuery.data?.quotes === 0 &&
          countsQuery.data?.relationships === 0
        }
        onComplete={() => {
          /* Persistencia y close manejados dentro del componente. */
        }}
      />

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
/**
 * τ-recortes-merge: los enlaces viejos `?view=recortes` apuntaban a la vista
 * top-level Recortes (ya removida). Antes de resolver mundo/sección iniciales,
 * reescribimos la URL al feed unificado `?world=notas&section=notas` (mapeando
 * tab=favoritos → segment=favoritos) para que el resto del arranque lea los
 * params nuevos — sin flash del mundo
 * trama. Corre UNA sola vez (guard de módulo): el redirect depende solo de la
 * URL de arranque, así que no debe re-evaluarse en cada render de WorldShell.
 */
let recortesRedirectApplied = false
function applyRecortesRedirectOnce() {
  if (recortesRedirectApplied || typeof window === 'undefined') return
  recortesRedirectApplied = true
  const search = resolveRecortesRedirectSearch(window.location.search)
  if (!search) return
  try {
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${search}${window.location.hash}`,
    )
  } catch {
    /* replaceState no disponible (entorno raro) — el deep-link viejo no rompe nada */
  }
}

function WorldShell() {
  applyRecortesRedirectOnce()
  const initialWorldFromUrl =
    typeof window === 'undefined'
      ? null
      : readWorldDeepLinkFromSearch(window.location.search)
  const [world, setWorld] = useState<World>(() => {
    if (typeof window === 'undefined') return DEFAULT_WORLD
    if (initialWorldFromUrl) return initialWorldFromUrl
    // El ÚLTIMO mundo usado gana (continuidad). Si no hay (navegador fresco),
    // siembra con el mundo default configurado (espejo localStorage, sin red).
    const saved = window.localStorage.getItem(WORLD_STORAGE_KEY)
    if (saved === 'notas' || saved === 'trama') return saved as World
    const def = readUserPrefsMirror().defaultWorld
    return def === 'notas' || def === 'trama' ? def : DEFAULT_WORLD
  })
  const changeWorld = useCallback((w: World) => {
    // Cambiar de mundo es la navegación más grande de la app: cruza con la
    // misma transición suave que el cambio de vista.
    startViewTransition(() => setWorld(w))
    try {
      window.localStorage.setItem(WORLD_STORAGE_KEY, w)
    } catch {
      /* storage deshabilitado */
    }
  }, [])

  useEffect(() => {
    if (!initialWorldFromUrl) return
    try {
      window.localStorage.setItem(WORLD_STORAGE_KEY, initialWorldFromUrl)
    } catch {
      /* storage deshabilitado */
    }
  }, [initialWorldFromUrl])
  // Precarga el bundle (lazy) de Notas tras el arranque: cambiar de mundo no espera el chunk.
  useEffect(() => {
    const t = window.setTimeout(() => preloadWorldBundle('notas'), 1200)
    return () => window.clearTimeout(t)
  }, [])

  // Multiusuario en navegador compartido: si cambia el usuario autenticado, no
  // hereda el último mundo / espejo de prefs del anterior — los descarta y
  // resetea al mundo default. Sin Clerk el id es null → nunca dispara.
  const clientUserId = useCurrentClientUserId()
  useEffect(() => {
    if (!clientUserId) return
    let last: string | null = null
    try {
      last = window.localStorage.getItem('trama:auth-user')
    } catch {
      return
    }
    if (last === clientUserId) return
    if (last !== null) {
      clearUserPrefsMirror()
      try {
        window.localStorage.removeItem(WORLD_STORAGE_KEY)
      } catch {
        /* ignore */
      }
      setWorld(DEFAULT_WORLD)
    }
    try {
      window.localStorage.setItem('trama:auth-user', clientUserId)
    } catch {
      /* ignore */
    }
  }, [clientUserId])

  // Identidad de acento por mundo (Notas = salvia) vía clase en <html>.
  useWorldThemeClass(world)

  // Revelar un módulo del mundo Notas desde el ⌘K del mundo principal: lo
  // des-oculta, agenda abrir esa sección, y cruza al mundo Notas.

  const [pendingNotasSection, setPendingNotasSection] = useState<NotasSection | null>(
    () =>
      initialWorldFromUrl === 'notas' && typeof window !== 'undefined'
        ? readNotasSectionDeepLinkFromSearch(window.location.search)
        : null,
  )
  const revealNotasModule = useCallback(
    (moduleId: NotasSection) => {
      setPendingNotasSection(moduleId)
      changeWorld('notas')
    },
    [changeWorld],
  )

  // El conmutador de mundos vive en el logo (WorldSwitcher), dentro del header
  // de cada mundo — por eso acá no hay riel: se monta el mundo activo a pantalla
  // completa y se le pasa el control de cambio de mundo.
  return (
    <div className="h-screen w-screen overflow-hidden">
      <div key={world} className="h-full animate-view-fade">
        {world === 'trama' ? (
          <Shell
            world={world}
            onChangeWorld={changeWorld}
            onRevealNotasModule={revealNotasModule}
          />
        ) : (
          <Suspense fallback={<WorldLoadingFallback />}>
            <NotasWorld
              world={world}
              onChangeWorld={changeWorld}
              initialSection={pendingNotasSection ?? undefined}
            />
          </Suspense>
        )}
      </div>
      {/* Los toasts son globales A AMBOS mundos: vivía dentro de Shell (solo
          Trama) y los toasts del mundo Notas — incluido el Deshacer de la ola
          transversal — no se renderizaban nunca. */}
      <ToastHost />
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
