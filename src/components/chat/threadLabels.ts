/**
 * Helpers de labels para hilos de chat. Convierten el `context` del hilo
 * (string libre o null) en strings legibles para título / subtítulo.
 *
 * Convenciones de contexto:
 *   - null         → conversación libre, sin sección de origen
 *   - 'entity:ID'  → hilo iniciado desde una entidad específica
 *   - 'citas'      → desde la vista Citas
 *   - 'momentos'   → desde la vista Momentos
 *   - etc.
 */

/** Título por default cuando el hilo no tiene uno asignado. */
export function defaultTitleFor(context: string | null | undefined): string {
  if (!context) return '(sin título)'
  if (context.startsWith('entity:')) return 'Conversación con una entidad'
  const label = context.charAt(0).toUpperCase() + context.slice(1)
  return `Hilo de ${label}`
}

/**
 * Subtítulo contextual del hilo activo. Aparece debajo del título en el
 * header de la conversación — dice de DÓNDE nació ese hilo en
 * particular. Antes era la misma descripción de la app en todos los
 * hilos (ruido informativo); ahora es específico.
 */
export function threadSubtitle(context: string | null | undefined): string {
  if (!context) {
    return 'Conversación libre — la IA usa toda tu trama como contexto.'
  }
  if (context.startsWith('entity:')) {
    return 'Hilo enfocado en una entidad de tu trama.'
  }
  const label = context.charAt(0).toUpperCase() + context.slice(1)
  return `Iniciado desde ${label}.`
}
