import type { TaskPriority } from '../../api'

/** Orden visual: la prioridad más alta primero. */
export const PRIORITY_ORDER: TaskPriority[] = ['alta', 'media', 'baja']

/** Próxima prioridad al ciclar (clic en el punto): alta → media → baja → alta. */
export const PRIORITY_NEXT: Record<TaskPriority, TaskPriority> = {
  alta: 'media',
  media: 'baja',
  baja: 'alta',
}

/** Metadatos de cada prioridad — color (token semántico) y etiqueta. */
export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; color: string; soft: string }
> = {
  alta: {
    label: 'alta',
    color: 'var(--priority-alta)',
    soft: 'var(--priority-alta-soft)',
  },
  media: {
    label: 'media',
    color: 'var(--priority-media)',
    soft: 'var(--priority-media-soft)',
  },
  baja: {
    label: 'baja',
    color: 'var(--priority-baja)',
    soft: 'var(--priority-baja-soft)',
  },
}

/**
 * Selector de prioridad en tres puntos de color (alta · media · baja). El punto
 * activo se ve lleno y con un halo suave; los demás quedan atenuados. Se usa
 * tanto para crear (composer) como para cambiar la prioridad de un recordatorio
 * existente. El color es la marca visual que el usuario reconoce de un vistazo.
 */
export function PriorityDots({
  value,
  onChange,
  disabled = false,
}: {
  value: TaskPriority
  onChange: (p: TaskPriority) => void
  disabled?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Prioridad"
      className="inline-flex items-center gap-0.5"
    >
      {PRIORITY_ORDER.map((p) => {
        const meta = PRIORITY_META[p]
        const on = value === p
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`Prioridad ${meta.label}`}
            title={`Prioridad ${meta.label}`}
            disabled={disabled}
            onClick={() => onChange(p)}
            className="p-1 rounded-full transition-transform hover:scale-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
          >
            <span
              aria-hidden
              className="block size-2.5 rounded-full transition-all"
              style={{
                backgroundColor: meta.color,
                opacity: on ? 1 : 0.3,
                transform: on ? 'scale(1.15)' : 'scale(1)',
                boxShadow: on
                  ? `0 0 0 2px color-mix(in srgb, ${meta.color} 22%, transparent)`
                  : 'none',
              }}
            />
          </button>
        )
      })}
    </div>
  )
}
