/**
 * Secciones del mundo Notas. Vive en `types/` (no en un componente) porque lo
 * consumen capas transversales: hooks (visibilidad, command search), `App`,
 * el chrome y los alias del buscador.
 */
export const NOTAS_SECTIONS = [
  'inicio',
  'notas',
  'tareas',
  'prompts',
  'claves',
  'pdf',
  'planillas',
] as const

export type NotasSection = (typeof NOTAS_SECTIONS)[number]
