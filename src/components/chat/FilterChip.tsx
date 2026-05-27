/**
 * Chip de filtro para el rail de hilos en ChatView. Estado activo usa
 * accent-primary; inactivo cae a ink-400 con hover ink-700.
 *
 * Reutilizado por los filtros de contexto (todos / libres / citas /
 * momentos / etc.). Aislado para que la lista de filtros del rail
 * quede declarativa.
 */
export function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'px-2 py-0.5 rounded-full text-micro uppercase tracking-eyebrow font-medium transition-colors'
          : 'px-2 py-0.5 rounded-full text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 hover:bg-ink-700/5 transition-colors'
      }
      style={
        active
          ? {
              backgroundColor: 'var(--accent-primary-soft)',
              color: 'var(--accent-primary)',
            }
          : undefined
      }
    >
      {label}
    </button>
  )
}
