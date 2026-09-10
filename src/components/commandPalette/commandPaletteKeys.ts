import {
  COMMAND_SEARCH_SIGILS,
  parseCommandQuery,
} from '../../hooks/commandSearchGrammar'

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)

/** La tecla de acción de la plataforma, como se muestra en la paleta. */
export const COMMAND_PALETTE_MOD_KEY = IS_MAC ? '⌘' : 'Ctrl'

export type CommandPaletteKeyTarget = 'search' | 'control' | 'none'
export type CommandPaletteKeyIntent = 'next' | 'previous' | 'select' | 'ask' | 'act'

/**
 * Qué hace una tecla dentro de la paleta. La lista la gobierna el campo de
 * búsqueda, o nadie cuando el foco se perdió al cambiar de modo. Con el foco en
 * otro control (volver, el nombre de la consulta, una fila alcanzada con Tab)
 * la tecla hace lo que ese control hace: antes, Enter en «nombre de la
 * consulta» abría el resultado enfocado y cerraba la paleta sin guardar.
 *
 * ⇧Enter hace la acción de la fila (marcar hecha, copiar) sin abrirla.
 */
export function resolveCommandPaletteKey({
  key,
  metaKey,
  ctrlKey,
  shiftKey = false,
  isComposing,
  target,
}: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey?: boolean
  isComposing: boolean
  target: CommandPaletteKeyTarget
}): CommandPaletteKeyIntent | null {
  if (target === 'control' || isComposing) return null
  if (key === 'ArrowDown') return 'next'
  if (key === 'ArrowUp') return 'previous'
  if (key !== 'Enter') return null
  if (metaKey || ctrlKey) return 'ask'
  return shiftKey ? 'act' : 'select'
}

/**
 * La ayuda del pie. Con la búsqueda vacía enseña la gramática, que de otro modo
 * no se descubre; escribiendo, las teclas que actúan sobre la lista.
 */
export function describeCommandPaletteHints(
  query: string,
  modKey: string = COMMAND_PALETTE_MOD_KEY,
): string {
  if (!query.trim()) {
    return COMMAND_SEARCH_SIGILS.map((entry) => `${entry.sigil} ${entry.label}`).join(
      ' · ',
    )
  }
  if (parseCommandQuery(query).scope === 'preguntar')
    return 'enter preguntar · esc cerrar'
  return `↑↓ navegar · enter abrir · ${modKey} enter preguntar · esc cerrar`
}

/** El alcance que anuncia la lista cuando la búsqueda empieza con un sigilo. */
export function describeCommandPaletteScope(query: string): string | null {
  const { scope } = parseCommandQuery(query)
  return COMMAND_SEARCH_SIGILS.find((entry) => entry.scope === scope)?.heading ?? null
}
