/**
 * Transformaciones puras de markdown para la barra de formato flotante de las
 * notas. Cada función recibe el texto completo del campo y el rango seleccionado
 * (`selStart`/`selEnd`, índices de caracteres) y devuelve el texto resultante
 * junto con el nuevo rango de selección/caret que el campo debe restaurar.
 *
 * Son PURAS: no tocan el DOM ni el textarea. El componente que las usa aplica el
 * resultado (`value`) y luego reposiciona la selección con `selStart`/`selEnd`.
 *
 * Convención de marcas (alineada con `notas/markdown.tsx`):
 *   - negrita → `**…**`
 *   - cursiva → `_…_` (el renderer italiza `_`, NO `*`: `*` queda para `**negrita**`)
 *   - cita    → prefijo `> ` por línea
 *   - enlace  → `[texto](url)`
 *
 * Todas las marcas son "toggle": si la selección ya está envuelta, se quita.
 */

export type FormatResult = {
  value: string
  selStart: number
  selEnd: number
}

/** Envuelve (o desenvuelve) la selección con un marcador inline simétrico. */
function toggleWrap(
  value: string,
  selStart: number,
  selEnd: number,
  marker: string,
): FormatResult {
  const before = value.slice(0, selStart)
  const sel = value.slice(selStart, selEnd)
  const after = value.slice(selEnd)
  const len = marker.length

  // ¿La selección YA está envuelta? Dos formas: el marcador está dentro de la
  // selección (`**texto**` seleccionado) o justo por fuera (`texto` con `**`
  // alrededor sin seleccionar). Tratamos ambas como "toggle off".
  if (sel.length >= len * 2 && sel.startsWith(marker) && sel.endsWith(marker)) {
    const inner = sel.slice(len, sel.length - len)
    return {
      value: before + inner + after,
      selStart,
      selEnd: selStart + inner.length,
    }
  }
  if (before.endsWith(marker) && after.startsWith(marker)) {
    const newBefore = before.slice(0, before.length - len)
    const newAfter = after.slice(len)
    return {
      value: newBefore + sel + newAfter,
      selStart: selStart - len,
      selEnd: selEnd - len,
    }
  }

  // Envolver. La selección queda apuntando al texto interno (sin los marcadores)
  // para que un segundo click haga toggle off limpio.
  const wrapped = marker + sel + marker
  return {
    value: before + wrapped + after,
    selStart: selStart + len,
    selEnd: selStart + len + sel.length,
  }
}

/** Negrita: envuelve la selección en `**…**` (toggle). */
export function bold(value: string, selStart: number, selEnd: number): FormatResult {
  return toggleWrap(value, selStart, selEnd, '**')
}

/** Cursiva: envuelve la selección en `_…_` (toggle). El renderer de notas
 *  italiza `_…_`, no `*…*` (que queda reservado para `**negrita**`). */
export function italic(value: string, selStart: number, selEnd: number): FormatResult {
  return toggleWrap(value, selStart, selEnd, '_')
}

/**
 * Cita: prefija cada línea seleccionada con `> ` (toggle). Si TODAS las líneas
 * ya están citadas, las descita. El rango se expande a líneas completas para que
 * la marca sea coherente aunque la selección empiece a mitad de línea.
 */
export function quote(value: string, selStart: number, selEnd: number): FormatResult {
  // Expandir el rango al inicio de la primera línea y al fin de la última.
  const lineStart = value.lastIndexOf('\n', selStart - 1) + 1
  let lineEnd = value.indexOf('\n', selEnd)
  if (lineEnd === -1) lineEnd = value.length
  // Si la selección termina justo en un salto de línea, no arrastramos la línea
  // vacía siguiente.
  if (selEnd > selStart && value[selEnd - 1] === '\n') {
    lineEnd = selEnd - 1
  }

  const before = value.slice(0, lineStart)
  const block = value.slice(lineStart, lineEnd)
  const after = value.slice(lineEnd)
  const lines = block.split('\n')

  const allQuoted = lines.every((l) => /^>\s?/.test(l))
  const next = allQuoted
    ? lines.map((l) => l.replace(/^>\s?/, '')).join('\n')
    : lines.map((l) => `> ${l}`).join('\n')

  return {
    value: before + next + after,
    selStart: lineStart,
    selEnd: lineStart + next.length,
  }
}

/**
 * Enlace: convierte la selección en `[sel](url)`. Si NO hay texto seleccionado,
 * inserta `[](https://)` con el caret sobre la URL. Si hay texto, inserta
 * `[sel](https://)` y selecciona el `https://` para que el usuario escriba la
 * dirección encima (sin `prompt()`).
 */
export function link(value: string, selStart: number, selEnd: number): FormatResult {
  const before = value.slice(0, selStart)
  const sel = value.slice(selStart, selEnd)
  const after = value.slice(selEnd)
  const placeholder = 'https://'

  if (sel.length === 0) {
    // `[](https://)` — caret sobre la URL (seleccionada para reemplazar).
    const inserted = `[](${placeholder})`
    const urlStart = selStart + 3 // tras `[](`
    return {
      value: before + inserted + after,
      selStart: urlStart,
      selEnd: urlStart + placeholder.length,
    }
  }

  const inserted = `[${sel}](${placeholder})`
  const urlStart = selStart + 1 + sel.length + 2 // tras `[sel](`
  return {
    value: before + inserted + after,
    selStart: urlStart,
    selEnd: urlStart + placeholder.length,
  }
}
