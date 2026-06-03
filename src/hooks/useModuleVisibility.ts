import { useUserPrefs, useSaveUserPrefs } from '../state'
import type { NotasSection } from '../components/notas/NotasWorld'

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

  const isVisible = (id: NotasSection) =>
    id === NON_HIDEABLE ? true : visibleModules[id] !== false

  const setVisible = (id: NotasSection, on: boolean) => {
    if (id === NON_HIDEABLE) return
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

  return { isVisible, setVisible, reveal, showAll, visibleModules }
}
