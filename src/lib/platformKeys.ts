/**
 * El modificador de atajos según la plataforma: ⌘ en Mac y Ctrl en el resto. Se
 * calcula una vez, en el módulo; sin `navigator` cuenta como no-Mac.
 */
export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)

export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl'
