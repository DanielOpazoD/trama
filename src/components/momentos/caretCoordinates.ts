/**
 * Coordenadas (px, relativas al borde superior-izquierdo del textarea) del
 * cursor en una posición dada. No hay API nativa para esto, así que usamos la
 * técnica del "div espejo": clonamos el textarea como un div con el mismo box
 * model y tipografía, escribimos el texto hasta el caret y medimos un span
 * marcador en esa posición. Es el mismo enfoque que usan los editores tipo
 * Notion/Slack para anclar su menú de menciones al cursor.
 *
 * Sin test unitario a propósito: depende del motor de layout del navegador,
 * que happy-dom (el entorno de tests) no implementa — mediría siempre 0.
 */

/** Propiedades que el div espejo debe heredar para que el wrapping coincida. */
const MIRROR_PROPS = [
  'boxSizing',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontFamily',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textIndent',
  'textTransform',
  'whiteSpace',
  'wordWrap',
  'wordBreak',
  'overflowWrap',
  'tabSize',
] as const

export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number,
): { top: number; left: number; height: number } {
  const computed = window.getComputedStyle(textarea)
  const mirror = document.createElement('div')
  const s = mirror.style
  s.position = 'absolute'
  s.top = '0'
  s.left = '-9999px'
  s.visibility = 'hidden'
  s.whiteSpace = 'pre-wrap'
  s.wordWrap = 'break-word'
  for (const prop of MIRROR_PROPS) {
    s.setProperty(toKebab(prop), computed.getPropertyValue(toKebab(prop)))
  }
  // El ancho del contenido debe igualar el del textarea para que el wrapping
  // de líneas sea idéntico.
  s.width = `${textarea.clientWidth}px`

  mirror.textContent = textarea.value.slice(0, position)
  const marker = document.createElement('span')
  // Un carácter no vacío para que el span tenga caja aunque sea fin de texto.
  marker.textContent = textarea.value.slice(position) || '.'
  mirror.appendChild(marker)

  document.body.appendChild(mirror)
  const top = marker.offsetTop - textarea.scrollTop
  const left = marker.offsetLeft - textarea.scrollLeft
  const height = parseFloat(computed.lineHeight) || marker.offsetHeight
  document.body.removeChild(mirror)

  return { top, left, height }
}

function toKebab(prop: string): string {
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}
