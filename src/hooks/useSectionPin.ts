import { useUserPrefs, useSaveUserPrefs } from '../state'

/**
 * PIN protection per section (ambos mundos: Trama ViewMode + Notas section).
 * Lee/escribe `pinnedSections` en UserPrefs.
 *
 * Una sección "pinned" requiere re-ingreso del PIN cada vez que el usuario
 * navega a ella (no se cachea en sesión).
 */
export function useSectionPin() {
  const { data } = useUserPrefs()
  const save = useSaveUserPrefs()
  const pinnedSections = data?.pinnedSections ?? {}

  /** ¿La sección requiere PIN? */
  const isPinRequired = (id: string) => pinnedSections[id] === true

  /** Activar/desactivar PIN para una sección. */
  const setPinRequired = (id: string, on: boolean) => {
    save.mutate({ pinnedSections: { ...pinnedSections, [id]: on } })
  }

  return { isPinRequired, setPinRequired, pinnedSections }
}
