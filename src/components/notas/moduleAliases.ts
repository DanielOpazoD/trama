import type { NotasSection } from './NotasWorld'

/**
 * Tokens para revelar/abrir un módulo del mundo Notas desde el buscador
 * (p. ej. escribir "#pass" abre Claves aunque esté oculto en la barra).
 *
 * Es ACCESO RÁPIDO / declutter, NO seguridad: cualquiera que conozca el token
 * puede abrir el módulo. Lo que protege a Claves es su propio vault/PIN, no esto.
 */
export type ModuleAlias = {
  /** Token sin el '#' inicial, en minúsculas. */
  token: string
  moduleId: NotasSection
  label: string
}

export const MODULE_ALIASES: ModuleAlias[] = [
  { token: 'pass', moduleId: 'claves', label: 'Claves' },
  { token: 'claves', moduleId: 'claves', label: 'Claves' },
]

/**
 * Matchea un token tipeado (con o sin '#' inicial, case-insensitive) contra el
 * mapa de alias. Devuelve el alias o `null`.
 */
export function matchModuleAlias(query: string): ModuleAlias | null {
  const t = query.trim().toLowerCase().replace(/^#/, '')
  if (!t) return null
  return MODULE_ALIASES.find((a) => a.token === t) ?? null
}
