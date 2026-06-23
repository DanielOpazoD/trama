import type { MouseEvent } from 'react'
import { CheckIcon } from '../Icons'
import { IconButton } from '../IconButton'

/**
 * Círculo de selección de un archivo de la Biblioteca — compartido por las cards
 * (cuadrícula) y las filas (lista). Un botón-toggle (`aria-pressed`) que NO abre
 * el visor: frena la propagación del clic hacia la card/fila que lo contiene.
 *
 * Visibilidad: siempre visible cuando está marcado o cuando hay alguna selección
 * activa (`anySelected`); si no, aparece al hover/focus del contenedor (clases
 * `group-hover`/`group-focus-within` del padre). Marcado: relleno sage + ✓.
 *
 * Presentacional: el estado vive en el orquestador (BibliotecaView).
 */
export function SelectionCircle({
  selected,
  anySelected,
  label,
  onToggle,
  className = '',
}: {
  selected: boolean
  /** ¿Hay al menos un item seleccionado en la vista? Mantiene el círculo visible. */
  anySelected: boolean
  label: string
  onToggle: () => void
  className?: string
}) {
  function handleClick(event: MouseEvent) {
    // No abrir el visor de la card/fila al togglear la selección.
    event.preventDefault()
    event.stopPropagation()
    onToggle()
  }

  // Visible si está marcado o si hay selección activa; si no, solo al hover/focus
  // del contenedor (el padre expone `group`). En táctil (sin hover) el padre ya
  // deja sus controles visibles, así que esto acompaña ese comportamiento.
  const visibility =
    selected || anySelected
      ? 'opacity-100'
      : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'

  return (
    <IconButton
      role="checkbox"
      aria-checked={selected}
      label={label}
      onClick={handleClick}
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-300 motion-reduce:transition-none ${visibility} ${
        selected
          ? 'border-[color:var(--accent-sage)] bg-[color:var(--accent-sage)] text-paper-50'
          : 'border-ink-300/60 bg-paper-50/90 text-transparent hover:border-ink-400'
      } ${className}`}
    >
      <CheckIcon size={12} strokeOverride={2.4} />
    </IconButton>
  )
}
