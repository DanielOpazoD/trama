import { useUserPrefs, useSaveUserPrefs } from '../state'

/**
 * PIN protection per section (ambos mundos: Trama ViewMode + Notas section).
 * Lee/escribe `pinnedSections` en UserPrefs.
 *
 * Una sección "pinned" requiere re-ingreso del PIN cada vez que el usuario
 * navega a ella (no se cachea en sesión).
 */
export function useSectionPin() {
  const { data, isPlaceholderData } = useUserPrefs()
  const save = useSaveUserPrefs()
  const pinnedSections = data?.pinnedSections ?? {}
  // El espejo local puede estar viejo: mientras no responda el servidor, lo que
  // se esconde por PIN se da por escondido.
  const ready = data !== undefined && !isPlaceholderData

  /** ¿La sección requiere PIN? */
  const isPinRequired = (id: string) => pinnedSections[id] === true

  /** ¿Se esconde su contenido fuera de la sección (buscador, preguntas)? Falla
      cerrado hasta tener las preferencias del servidor. */
  const isContentHidden = (id: string) => !ready || pinnedSections[id] === true

  /** Activar/desactivar PIN para una sección. */
  const setPinRequired = (id: string, on: boolean) => {
    save.mutate({ pinnedSections: { ...pinnedSections, [id]: on } })
  }

  return { isPinRequired, isContentHidden, setPinRequired, pinnedSections }
}
