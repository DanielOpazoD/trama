/**
 * Secciones del mundo Notas. Vive en `types/` (no en un componente) porque lo
 * consumen capas transversales: hooks (visibilidad, command search), `App`,
 * el chrome y los alias del buscador.
 */
export type NotasSection = 'inicio' | 'notas' | 'tareas' | 'prompts' | 'claves'
