import type { TaskPriority } from '../../api'
import { CheckIcon } from '../Icons'
import { OverflowMenu, OverflowMenuItem } from '../OverflowMenu'

/** Orden visual: la prioridad más alta primero. */
export const PRIORITY_ORDER: TaskPriority[] = ['alta', 'media', 'baja']

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

/**
 * Selector de prioridad como menú desplegable — el trigger es el punto de color
 * actual; al abrir, muestra los tres colores para elegir uno directo (sin ciclar
 * con clics sucesivos). Pensado para cambiar la prioridad de una tarea ya creada.
 */
export function PriorityMenu({
  value,
  onChange,
}: {
  value: TaskPriority
  onChange: (p: TaskPriority) => void
}) {
  const meta = PRIORITY_META[value]
  return (
    <OverflowMenu
      label={`Prioridad ${meta.label} · cambiar`}
      width="w-40"
      triggerClassName="touch-target inline-flex p-1 rounded-full transition-transform hover:scale-110"
      triggerContent={
        <span
          aria-hidden
          className="block size-2.5 rounded-full"
          style={{ backgroundColor: meta.color }}
        />
      }
    >
      {(close) => (
        <>
          <p className="px-2.5 pt-1 pb-1.5 text-micro uppercase tracking-eyebrow text-ink-300">
            Prioridad
          </p>
          {PRIORITY_ORDER.map((p) => {
            const m = PRIORITY_META[p]
            return (
              <OverflowMenuItem
                key={p}
                onClick={() => {
                  onChange(p)
                  close()
                }}
              >
                <span
                  aria-hidden
                  className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: m.color }}
                />
                <span className="flex-1 capitalize">{m.label}</span>
                {p === value && <CheckIcon size={12} className="text-ink-500" />}
              </OverflowMenuItem>
            )
          })}
        </>
      )}
    </OverflowMenu>
  )
}
