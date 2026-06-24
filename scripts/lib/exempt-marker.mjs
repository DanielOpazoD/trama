// Primitivo compartido de EXENCIÓN por MARCADOR INLINE para los gates ratchet
// por-línea de la familia Claude-owned (check:focus-ring, check:form-control-labels,
// check:icon-button).
//
// Un gate de esta familia cuenta "construcciones ofensoras" por línea (una
// utilidad de foco horneada, un control sin nombre accesible, un <button> de
// solo-ícono) y congela el conteo (ratchet). Este módulo gobierna CÓMO se exime
// una de esas líneas, de forma IDÉNTICA entre gates, para que la familia no
// derive:
//
//   - Una construcción en la línea L queda EXENTA si hay un comentario
//     `<keyword>: <razón>` CON razón no vacía en la línea L (la misma) o en la
//     L-1 (la de arriba). Un marcador pelado (`<keyword>:` sin razón, o sin los
//     dos puntos) NO exime — sería un bypass sin justificar.
//   - Un marcador en la línea M (con o SIN razón) es VÁLIDO si hay una
//     construcción en M o en M+1; si no, es COLGANTE (dangling) y el gate debe
//     fallar para que se limpie. Así un marcador pelado tampoco pasa: o cuelga
//     (sin construcción) o no exime (la construcción sigue contando).
//
// El marcador precede (o comparte) la línea de la construcción. La razón viaja
// pegada al código y sobrevive a barridos que mueven líneas — lo que rompía al
// viejo allowlist `file:LÍNEA` (entradas stale → CI rojo al reordenar líneas).
//
// El gate aporta CÓMO detecta sus construcciones (regex de Tailwind, parseo de
// tags, etc.); este módulo aporta la semántica de exención/colgante, testeada una
// sola vez. Así la detección queda libre por gate y la exención queda unificada.

function escapeForRegExp(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createMarkerExemption(keyword) {
  if (typeof keyword !== 'string' || keyword.length === 0)
    throw new TypeError('createMarkerExemption requiere un keyword no vacío')

  // Captura candidata: `<keyword>: <lo que siga>`. La razón REAL se valida tras
  // limpiar el cierre de un comentario JSX (ver `exemptMatch`): NO exigimos `\S`
  // acá porque ese cierre `*/}` aporta un no-espacio y un `{/* <keyword>: */}`
  // pelado colaría como exención sin razón. No global: `.exec`/`.test` sin estado.
  const captureRe = new RegExp(`${escapeForRegExp(keyword)}:\\s*(.*)$`)
  // Presencia del keyword (con o SIN razón). Detecta marcadores colgantes o
  // malformados (p. ej. sin razón) que igual hay que limpiar, aunque no eximan.
  const keywordRe = new RegExp(`${escapeForRegExp(keyword)}\\b`)

  // La razón legible a partir de un match de `captureRe`: quita el cierre de un
  // comentario JSX (`*/}` o `*/`) que `(.*)$` arrastra cuando el marcador va como
  // `{/* … */}` en posición de hijo JSX (un <input> dentro de su <label>, un
  // <button> entre hermanos).
  function reasonFrom(match) {
    return match[1].replace(/\s*\*\/\}?\s*$/, '').trim()
  }

  // Match candidato en `line` SOLO si su razón (ya limpia) NO es vacía. Así un
  // marcador pelado —`// <keyword>:` o `{/* <keyword>: */}`— no exime.
  function exemptMatch(line) {
    const match = captureRe.exec(line)
    if (!match) return null
    return reasonFrom(match).length > 0 ? match : null
  }

  // Match del marcador que exime a la construcción de la línea `line` (1-based):
  // en su misma línea o en la inmediatamente anterior. Devuelve el match (con la
  // razón cruda en el grupo 1) o null. `lines` es el archivo crudo separado por \n.
  function markerFor(lines, line) {
    return (
      exemptMatch(lines[line - 1] ?? '') ||
      (line > 1 ? exemptMatch(lines[line - 2] ?? '') : null)
    )
  }

  // Líneas (1-based) con un marcador SIN una construcción en su misma línea ni en
  // la siguiente: quedaron colgando. `constructLines` es un Set de líneas
  // (1-based) donde el gate detectó una construcción ofensora.
  function danglingLines(lines, constructLines) {
    const dangling = []
    for (let i = 0; i < lines.length; i++) {
      if (!keywordRe.test(lines[i])) continue
      const here = i + 1
      if (!constructLines.has(here) && !constructLines.has(here + 1)) dangling.push(here)
    }
    return dangling
  }

  return { keyword, keywordRe, reasonFrom, markerFor, danglingLines }
}
