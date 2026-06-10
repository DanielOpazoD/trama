import { useCallback, useEffect, useState, useRef } from 'react'
import { startViewTransition } from '../lib/viewTransition'

/**
 * Estado de sección que se "clampa" a un fallback cuando la sección actual deja
 * de ser visible — anti-trampa: nunca te deja parado en una sección invisible
 * (p. ej. si la ocultás desde Settings). El `fallback` debe ser siempre visible.
 *
 * El setter navega con View Transition (crossfade out-quart) — el mismo gesto
 * que el cambio de vista del mundo Trama (`useInitialView`). El clamp interno
 * va directo: es una corrección, no una navegación del usuario.
 */
export function useClampedSection<T extends string>(
  initial: T,
  fallback: T,
  isVisible: (s: T) => boolean,
): readonly [T, (s: T) => void] {
  const [section, _setSection] = useState<T>(initial)
  const visible = isVisible(section)

  const lastSectionRef = useRef(section)
  const lastVisibleRef = useRef(visible)

  useEffect(() => {
    const sectionChanged = section !== lastSectionRef.current
    lastSectionRef.current = section

    if (sectionChanged) {
      lastVisibleRef.current = visible
      return
    }

    const wasVisible = lastVisibleRef.current
    lastVisibleRef.current = visible

    if (wasVisible && !visible) {
      _setSection(fallback)
    }
  }, [section, visible, fallback])

  const setSection = useCallback((s: T) => {
    startViewTransition(() => _setSection(s))
  }, [])
  return [section, setSection] as const
}
