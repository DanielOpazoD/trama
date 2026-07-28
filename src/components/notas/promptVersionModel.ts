import type { Prompt, PromptVersion } from '../../api'

/**
 * Cada fila del historial guarda el texto que el prompt tenía ANTES de una
 * edición. Eso hace que la lista sea legible al revés de como se guardó: para
 * saber qué cambió en una edición hay que comparar la versión con lo que vino
 * DESPUÉS — la versión anterior en la lista, o el prompt actual si es la más
 * reciente.
 *
 * Sin ese dato el historial es una pila de textos casi iguales y hay que leerlos
 * enteros para encontrar la diferencia. Con él, cada fila dice dónde mirar.
 */

export type CampoPrompt = 'título' | 'contenido' | 'colección'

export type VersionEntry = {
  version: PromptVersion
  /** Qué cambió en la edición que reemplazó a esta versión. */
  cambios: CampoPrompt[]
  /** Si el texto es idéntico al actual, volver aquí no cambiaría nada. */
  igualAlActual: boolean
}

type Texto = {
  title: string
  content: string
  collection: string | null
}

function diferencias(antes: Texto, despues: Texto): CampoPrompt[] {
  const campos: CampoPrompt[] = []
  if (antes.title !== despues.title) campos.push('título')
  if (antes.content !== despues.content) campos.push('contenido')
  if (antes.collection !== despues.collection) campos.push('colección')
  return campos
}

/**
 * Empareja cada versión con la edición que la reemplazó.
 *
 * `versions` llega de la más reciente a la más antigua, que es como la devuelve
 * el endpoint y como se lee un historial.
 */
export function buildVersionEntries(
  actual: Prompt,
  versions: PromptVersion[],
): VersionEntry[] {
  return versions.map((version, i) => {
    // Lo que vino después de esta versión: la anterior en la lista (más nueva),
    // o el prompt tal como está hoy si ésta es la más reciente.
    const despues = i === 0 ? actual : versions[i - 1]!
    return {
      version,
      cambios: diferencias(version, despues),
      igualAlActual: diferencias(version, actual).length === 0,
    }
  })
}

/** «contenido», «título y colección», «título, contenido y colección». */
export function describirCambios(cambios: CampoPrompt[]): string {
  if (cambios.length === 0) return 'sin cambios de texto'
  if (cambios.length === 1) return cambios[0]!
  return `${cambios.slice(0, -1).join(', ')} y ${cambios[cambios.length - 1]}`
}

/**
 * Fecha legible sin depender de un reloj: «14 jul, 09:32». Las relativas
 * («hace 3 días») envejecen mal en una lista que se mira de una vez y obligan a
 * un reloj vivo para no mentir.
 */
export function fechaDeVersion(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
