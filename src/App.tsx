import { useCallback, useEffect, useState } from 'react'
import { useIsMobile } from './hooks/useIsMobile'
import { useSearchParamState } from './hooks/useSearchParamState'
import { useInitialView } from './hooks/useInitialView'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { startViewTransition } from './lib/viewTransition'
import { readOAuthReturn, clearOAuthReturn, type OAuthReturn } from './lib/oauthReturn'
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
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { Onboarding } from './components/Onboarding'
import { ToastHost } from './components/ToastHost'
import { PreviewBanner } from './components/PreviewBanner'
import { AskBar } from './components/AskBar'
import { ReadingMode } from './components/ReadingMode'
import { Splash } from './components/Splash'
import { ErrorBoundary } from './components/ErrorBoundary'
import { RightPanel, type PendingProposal } from './components/RightPanel'
import { ViewRouter } from './components/ViewRouter'
import { AuthGate } from './components/AuthGate'
import { AppPinGate } from './components/AppPinGate'
import { MobileBottomNav } from './components/MobileBottomNav'
import { SectionAccentBand } from './components/SectionAccentBand'
import { FocusModeExitButton } from './components/FocusModeExitButton'
import { ShellOverlays } from './components/ShellOverlays'
import { MomentoNotificationsCenter } from './components/momentos/MomentoNotificationsCenter'
import { NotasWorld } from './components/notas/NotasWorld'
import { NOTAS_SECTIONS, type NotasSection } from './types/notas'
import { resolveRecortesRedirect } from './lib/recortesRedirect'
import type { CommandAction } from './components/CommandPalette'

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
  const modals = useAppModals()
  const { openModal } = modals
  // Retorno de un OAuth (X / Spotify): el callback redirige acá con
  // `?x=connected` o `?x_error=...`. Lo leemos una vez al montar, abrimos
  // Settings en el panel correcto y limpiamos la URL. Antes esto era invisible.
  const [oauthReturn, setOauthReturn] = useState<OAuthReturn | null>(() =>
    readOAuthReturn(),
  )
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
      openModal('settings')
      clearOAuthReturn()
    }
  }, [oauthReturn, openModal])

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
  const exitFocusMode = useCallback(() => {
    setFocusMode(false)
    try {
      window.localStorage.setItem('trama:focus-mode', '0')
    } catch {
      /* storage disabled */
    }
  }, [])
  useGlobalShortcuts({
    onTogglePalette: () => modals.toggleModal('palette'),
    onOpenPalette: () => modals.openModal('palette'),
    onToggleShortcuts: () => modals.toggleModal('shortcuts'),
    onToggleFocusMode: toggleFocusMode,
  })

  const showProposal = pendingProposal !== null
  // El panel de detalle se puede abrir desde cualquier vista (graph, entidades,
  // citas) — no es exclusivo del grafo.
  const showDetail = !showProposal && selectedEntityId !== null
  const rightPanelOpen = showProposal || showDetail
  const shareInvitations = shareInvitationsQuery.data?.items ?? []

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
            onOpenSettings={() => modals.openModal('settings')}
            onOpenPalette={() => modals.openModal('palette')}
          />
        </div>
      )}

      <main className="flex-1 relative overflow-hidden flex flex-col">
        {!focusMode && (
          <div className="animate-shell-topbar">
            <TopBar
              view={view}
              world={world}
              onChangeWorld={onChangeWorld}
              onSortes={() => modals.openModal('sortes')}
              actions={
                <MomentoNotificationsCenter
                  invitations={shareInvitations}
                  pending={respondShareInvitation.isPending}
                  onRespond={handleShareInvitationResponse}
                />
              }
              breadcrumb={
                // Si hay una entidad seleccionada y existe en cache,
                // muestra "View › Nombre" — orientación visual estilo
                // Codex (path-style) en lugar de solo el título de vista.
                showDetail && selectedEntityId
                  ? {
                      label: 'entidad',
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
        {/* Nav principal en móvil — barra SUPERIOR, unificada con el mundo Notas
            (antes vivía abajo). En focus mode o con el RightPanel abierto se oculta. */}
        {!focusMode && isMobile && !rightPanelOpen && (
          <MobileBottomNav
            view={view}
            onChangeView={(v) => {
              setView(v)
              if (v !== 'grafo') setSelectedEntityId(null)
            }}
          />
        )}
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
                onOpenReading={() => modals.openModal('reading')}
              />
            )}

          <ReadingMode
            open={modals.reading}
            onClose={() => modals.closeModal('reading')}
            onProposal={(text, proposal) => setPendingProposal({ text, proposal })}
          />
        </div>

        {/* Pill flotante de salida de focus mode — sin esto el usuario
            podría no saber cómo volver al shell completo. Discreto en
            la esquina superior derecha; click o tecla `\` para salir. */}
        {focusMode && <FocusModeExitButton onExit={exitFocusMode} />}
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
function readWorldDeepLink(): World | null {
  if (typeof window === 'undefined') return null
  try {
    const world = new URLSearchParams(window.location.search).get('world')
    return world === 'notas' || world === 'trama' ? world : null
  } catch {
    return null
  }
}

function readNotasSectionDeepLink(): NotasSection | null {
  if (typeof window === 'undefined') return null
  try {
    const section = new URLSearchParams(window.location.search).get('section')
    return NOTAS_SECTIONS.includes(section as NotasSection)
      ? (section as NotasSection)
      : null
  } catch {
    return null
  }
}

/**
 * τ-recortes-merge: los enlaces viejos `?view=recortes` apuntaban a la vista
 * top-level Recortes (ya removida). Antes de resolver mundo/sección iniciales,
 * reescribimos la URL a `?world=notas&section=bandeja` (preservando tab/project)
 * para que el resto del arranque lea los params nuevos — sin flash del mundo
 * trama. Corre UNA sola vez (guard de módulo): el redirect depende solo de la
 * URL de arranque, así que no debe re-evaluarse en cada render de WorldShell.
 */
let recortesRedirectApplied = false
function applyRecortesRedirectOnce() {
  if (recortesRedirectApplied || typeof window === 'undefined') return
  recortesRedirectApplied = true
  const redirect = resolveRecortesRedirect(window.location.search)
  if (!redirect) return
  try {
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${redirect.search}${window.location.hash}`,
    )
  } catch {
    /* replaceState no disponible (entorno raro) — el deep-link viejo no rompe nada */
  }
}

function WorldShell() {
  applyRecortesRedirectOnce()
  const initialWorldFromUrl = readWorldDeepLink()
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
    () => (initialWorldFromUrl === 'notas' ? readNotasSectionDeepLink() : null),
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
      {world === 'trama' ? (
        <Shell
          world={world}
          onChangeWorld={changeWorld}
          onRevealNotasModule={revealNotasModule}
        />
      ) : (
        <NotasWorld
          world={world}
          onChangeWorld={changeWorld}
          initialSection={pendingNotasSection ?? undefined}
        />
      )}
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
