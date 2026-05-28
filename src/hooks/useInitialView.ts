import { useCallback, useState } from 'react'
import { startViewTransition } from '../lib/viewTransition'
import type { ViewMode } from '../components/Sidebar'

/**
 * τ-mobile-bridge: lee `?view=` al primer render para honrar deep-links
 * externos (típicamente el QR de Momentos: `?view=momentos&compose=foto`).
 *
 * Whitelist explícita — un query param malicioso/tipeado no debe poder
 * setear cualquier string en el state. SSR-safe (devuelve 'inicio' si
 * `window` no existe).
 *
 * Devuelve `[view, setView]` igual que `useState`. El `setView`
 * envuelve a la View Transitions API (cross-dissolve sutil de ~280ms
 * declarado en index.css), con fallback automático al setState plano
 * en browsers sin soporte (Firefox).
 *
 * NOTA: el hook NO sincroniza el state de vuelta al URL cuando cambia.
 * El `?view=` es solo lectura inicial — si querés persistir, considerá
 * `useSearchParamState` (bidireccional). Decisión deliberada: cambiar
 * de sección no debe ensuciar la URL del usuario; los deep-links son
 * un caso de entrada, no de navegación interna.
 */
const VALID_VIEWS: ReadonlyArray<ViewMode> = [
  'inicio',
  'grafo',
  'entidades',
  'citas',
  'escuchas',
  'momentos',
  'cronologia',
  'atlas',
  'chat',
  'sugerencias',
]

function readInitialView(): ViewMode {
  if (typeof window === 'undefined') return 'inicio'
  try {
    const param = new URLSearchParams(window.location.search).get('view')
    if (param && VALID_VIEWS.includes(param as ViewMode)) {
      return param as ViewMode
    }
  } catch {
    /* malformed URL — fallback al default */
  }
  return 'inicio'
}

export function useInitialView(): [ViewMode, (next: ViewMode) => void] {
  const [view, _setView] = useState<ViewMode>(() => readInitialView())
  const setView = useCallback((next: ViewMode) => {
    startViewTransition(() => _setView(next))
  }, [])
  return [view, setView]
}
