import { useUserPrefs, useSaveUserPrefs } from '../state'
import type { NotasSection } from '../types/notas'

/**
 * Visibilidad por sección del mundo Notas, sincronizada por usuario (sobre
 * `useUserPrefs`). Default: todo visible (una sección está oculta solo si su
 * flag es explícitamente `false`). Todas las secciones son configurables.
 */
export function useModuleVisibility() {
  const { data } = useUserPrefs()
  const save = useSaveUserPrefs()
  const visibleModules = data?.visibleModules ?? {}

  /** ¿La sección se puede ocultar? Siempre true — el usuario configuró que
   *  todas sean configurables sin excepción. */
  const isHideable = (_id: NotasSection) => true

  const isVisible = (id: NotasSection) => visibleModules[id] !== false

  const setVisible = (id: NotasSection, on: boolean) => {
    save.mutate({ visibleModules: { ...visibleModules, [id]: on } })
  }

  /** Fuerza mostrar una sección oculta (usado por el comando del buscador). */
  const reveal = (id: NotasSection) => {
    if (visibleModules[id] === false) {
      save.mutate({ visibleModules: { ...visibleModules, [id]: true } })
    }
  }

  /** Vuelve a mostrar todo (reset). */
  const showAll = () => save.mutate({ visibleModules: {} })

  return { isVisible, isHideable, setVisible, reveal, showAll, visibleModules }
}
