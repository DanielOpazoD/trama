import type { NotasSection } from '../../types/notas'

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
  { token: 'imprenta', moduleId: 'pdf', label: 'Imprenta' },
  { token: 'pdf', moduleId: 'pdf', label: 'Imprenta' },
  { token: 'planillas', moduleId: 'planillas', label: 'Planillas' },
  { token: 'plantillas', moduleId: 'planillas', label: 'Planillas' },
  { token: 'formularios', moduleId: 'planillas', label: 'Planillas' },
]
