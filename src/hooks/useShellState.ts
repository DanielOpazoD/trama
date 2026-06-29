import { useCallback, useState } from 'react'
import { useSearchParamState } from './useSearchParamState'
import { startViewTransition } from '../lib/viewTransition'
import { readOAuthReturn, type OAuthReturn } from '../lib/oauthReturn'
import type { PendingProposal } from '../components/RightPanel'
import type { EntityTab } from '../components/appShell/appShellModel'

const FOCUS_MODE_KEY = 'trama:focus-mode'

function readInitialFocusMode(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(FOCUS_MODE_KEY) === '1'
}

function readInitialSidebarCollapsed(): boolean {
  // En mobile arrancamos con el sidebar colapsado; el usuario lo expande con el
  // ícono del menú.
  if (typeof window !== 'undefined') return window.innerWidth < 768
  return false
}

/**
 * Estado de UI del Shell del mundo Trama: qué entidad/propuesta/thread está
 * activo, el tab de Entidades, el modo foco (persistido) y el colapso del
 * sidebar, más los derivados de visibilidad del panel derecho.
 *
 * Extraído de App.tsx para que `Shell` quede como ensamblaje de subcomponentes.
 * NO incluye data (counts/queries/mutations) ni los modales (useAppModals) —
 * solo el estado de navegación/UI que el Shell cablea a sus piezas.
 */
export function useShellState() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readInitialSidebarCollapsed)

  // Sincronizado con `?entity=uuid` de la URL — permite copiar el link de una
  // entidad y compartirlo, o recargar manteniendo el panel abierto.
  const [selectedEntityId, _setSelectedEntityId] = useSearchParamState('entity')
  // Wrapper que pasa por la View Transitions API — el EntityRow de la lista y el
  // EntityHeader del panel comparten viewTransitionName, así que el browser anima
  // del card al header. Sin soporte, el state cambia sin animación.
  const setSelectedEntityId = useCallback(
    (id: string | null) => {
      startViewTransition(() => _setSelectedEntityId(id))
    },
    [_setSelectedEntityId],
  )

  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null)
  // Cuando el AskBar deep-linkea a chat con un thread específico.
  const [pendingChatThreadId, setPendingChatThreadId] = useState<string | null>(null)
  // ρ-struct: tab activo de Entidades — vive acá para que TopBar pueda exponerlo
  // como tabs contextuales (antes era state local de EntitiesWorkbench).
  const [entitiesTab, setEntitiesTab] = useState<EntityTab>('listado')
  // Retorno de un OAuth (X / Spotify): el callback redirige con `?x=connected` o
  // `?x_error=...`. Se lee una vez al montar; el Shell abre Settings y limpia la URL.
  const [oauthReturn, setOauthReturn] = useState<OAuthReturn | null>(() =>
    readOAuthReturn(),
  )
  // Focus mode — esconde sidebar, topbar y askbar. Persiste en localStorage para
  // que el usuario zen no tenga que reactivarlo cada sesión.
  const [focusMode, setFocusMode] = useState<boolean>(readInitialFocusMode)

  const toggleFocusMode = useCallback(() => {
    setFocusMode((on) => {
      const next = !on
      try {
        window.localStorage.setItem(FOCUS_MODE_KEY, next ? '1' : '0')
      } catch {
        /* storage disabled */
      }
      return next
    })
  }, [])
  const exitFocusMode = useCallback(() => {
    setFocusMode(false)
    try {
      window.localStorage.setItem(FOCUS_MODE_KEY, '0')
    } catch {
      /* storage disabled */
    }
  }, [])

  const showProposal = pendingProposal !== null
  // El panel de detalle se puede abrir desde cualquier vista (graph, entidades,
  // citas) — no es exclusivo del grafo.
  const showDetail = !showProposal && selectedEntityId !== null
  const rightPanelOpen = showProposal || showDetail

  return {
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
  }
}
