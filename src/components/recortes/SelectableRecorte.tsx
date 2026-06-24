import type { ReactNode } from 'react'

/**
 * Envoltorio de una tarjeta de captura para el modo selección (triage en lote).
 *
 * Espejo de `SelectableMomento`: en modo normal devuelve el hijo tal cual; en
 * modo selección lo envuelve en un contenedor clickeable con un checkbox arriba
 * a la izquierda y deja el contenido `pointer-events-none` para que el clic
 * siempre toggle la selección (y no dispare las acciones internas de la tarjeta).
 *
 * A11y: `role="checkbox"` + Space/Enter, convención WAI-ARIA.
 */
export function SelectableRecorte({
  selectionMode,
  selected,
  onToggleSelect,
  label,
  children,
}: {
  selectionMode: boolean
  selected: boolean
  onToggleSelect: () => void
  label: string
  children: ReactNode
}) {
  if (!selectionMode) return <>{children}</>

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      onToggleSelect()
    }
  }

  return (
    <div
      className={`relative cursor-pointer rounded-xl transition-all focus-ring ${
        selected ? 'selection-ring-gold' : 'ring-1 ring-transparent hover:ring-ink-100/80'
      }`}
      onClick={onToggleSelect}
      onKeyDown={handleKeyDown}
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      aria-label={label}
    >
      <div
        className="absolute left-2 top-2 z-10 flex size-5 items-center justify-center rounded-md border-2 pointer-events-none"
        style={{
          backgroundColor: selected ? 'var(--accent-gold)' : 'rgb(var(--paper-50))',
          borderColor: selected ? 'var(--accent-gold)' : 'rgb(var(--ink-300) / 0.6)',
        }}
        aria-hidden
      >
        {selected && (
          <span className="text-caption font-bold leading-none text-paper-50">✓</span>
        )}
      </div>
      <div className="pointer-events-none opacity-90">{children}</div>
    </div>
  )
}
