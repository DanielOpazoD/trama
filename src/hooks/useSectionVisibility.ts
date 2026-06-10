import { useUserPrefs, useSaveUserPrefs } from '../state'
import type { ViewMode } from '../types/view'

/**
 * Visibilidad por sección del mundo Trama (sidebar principal).
 * Mismo patrón que `useModuleVisibility` pero opera sobre `visibleSections`
 * en UserPrefs. Default: todo visible; una sección está oculta solo si su
 * flag es explícitamente `false`.
 */
export function useSectionVisibility() {
  const { data } = useUserPrefs()
  const save = useSaveUserPrefs()
  const visibleSections = data?.visibleSections ?? {}

  const isVisible = (id: ViewMode) => visibleSections[id] !== false

  const setVisible = (id: ViewMode, on: boolean) => {
    save.mutate({ visibleSections: { ...visibleSections, [id]: on } })
  }

  /** Vuelve a mostrar todo (reset). */
  const showAll = () => save.mutate({ visibleSections: {} })

  return { isVisible, setVisible, showAll, visibleSections }
}
