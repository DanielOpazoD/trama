import { useUserPrefs, useSaveUserPrefs } from '../state'
import type { NotasSection } from '../types/notas'

/** Inicio nunca se oculta: es el ancla siempre alcanzable (anti-trampa). */
const NON_HIDEABLE: NotasSection = 'inicio'

/**
 * Visibilidad por sección del mundo Notas, sincronizada por usuario (sobre
 * `useUserPrefs`). Default: todo visible (una sección está oculta solo si su
 * flag es explícitamente `false`). `inicio` no se puede ocultar.
 */
export function useModuleVisibility() {
  const { data } = useUserPrefs()
  const save = useSaveUserPrefs()
  const visibleModules = data?.visibleModules ?? {}

  /** ¿La sección se puede ocultar? (Inicio nunca.) Única fuente de esa regla. */
  const isHideable = (id: NotasSection) => id !== NON_HIDEABLE

  const isVisible = (id: NotasSection) =>
    isHideable(id) ? visibleModules[id] !== false : true

  const setVisible = (id: NotasSection, on: boolean) => {
    if (!isHideable(id)) return
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
