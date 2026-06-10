import { useUserPrefs, useSaveUserPrefs } from '../state'

/**
 * Custom commands/aliases per section (both Trama and Notas worlds).
 * Reads/writes `sectionAliases` in UserPrefs.
 */
export function useSectionAlias() {
  const { data } = useUserPrefs()
  const save = useSaveUserPrefs()
  const sectionAliases = data?.sectionAliases ?? {}

  /** Get the custom alias for a section. */
  const getAlias = (id: string) => sectionAliases[id] ?? ''

  /** Set the custom alias for a section. */
  const setAlias = (id: string, alias: string) => {
    save.mutate({ sectionAliases: { ...sectionAliases, [id]: alias } })
  }

  return { getAlias, setAlias, sectionAliases }
}
