/**
 * Gramática del buscador (⌘K): un sigilo al principio acota qué se busca, como
 * en los editores que conoce quien trabaja con teclado.
 *
 *   ?  preguntar a tu trama en lenguaje natural (y tus consultas guardadas)
 *   >  comandos: vistas, acciones y secciones de Notas
 *   @  entidades
 *   #  secciones: las vistas y las secciones de Notas, por nombre o alias
 *
 * Sin sigilo se busca en todo, como siempre. El sigilo tiene que ser el primer
 * carácter: con un espacio delante se busca el texto tal cual.
 */
export type CommandSearchScope =
  'todo' | 'preguntar' | 'comandos' | 'entidades' | 'secciones'

export const COMMAND_SEARCH_SIGILS: ReadonlyArray<{
  sigil: string
  scope: Exclude<CommandSearchScope, 'todo'>
  /** Cómo se nombra en la ayuda del pie («? preguntar»). */
  label: string
  /** Cómo se anuncia el alcance sobre la lista. */
  heading: string
}> = [
  {
    sigil: '?',
    scope: 'preguntar',
    label: 'preguntar',
    heading: 'pregunta en lenguaje natural',
  },
  { sigil: '>', scope: 'comandos', label: 'comandos', heading: 'solo comandos' },
  { sigil: '@', scope: 'entidades', label: 'entidades', heading: 'solo entidades' },
  {
    sigil: '#',
    scope: 'secciones',
    label: 'secciones',
    heading: 'solo secciones',
  },
]

export type ParsedCommandQuery = { scope: CommandSearchScope; text: string }

export function parseCommandQuery(raw: string): ParsedCommandQuery {
  const entry = COMMAND_SEARCH_SIGILS.find(({ sigil }) => raw.startsWith(sigil))
  return entry
    ? { scope: entry.scope, text: raw.slice(entry.sigil.length).trim() }
    : { scope: 'todo', text: raw.trim() }
}

/**
 * El texto que se busca en el servidor. Solo lo piden los alcances con
 * contenido que traer: preguntar va por su propia consulta, y comandos y
 * secciones son locales.
 */
export function serverQueryFor(raw: string): string {
  const { scope, text } = parseCommandQuery(raw)
  return scope === 'todo' || scope === 'entidades' ? text : ''
}
