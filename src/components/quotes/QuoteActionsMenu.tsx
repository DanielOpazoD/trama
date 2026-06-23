import { createPortal } from 'react-dom'
import { useAnchoredPopover } from '../../hooks/useAnchoredPopover'
import { SparkleIcon, TrashIcon } from '../Icons'

/**
 * ρ-citas: menú "⋯" que agrupa las acciones secundarias de una cita
 * (Editar, Lámina, Reflexionar con IA, Eliminar) en un solo control.
 *
 * El popover se renderiza con `createPortal` a `document.body` y se posiciona
 * con coordenadas `fixed` calculadas desde el botón — así flota libre y NO se
 * recorta dentro de la columna de lectura (`max-w-3xl`). Se cierra al hacer
 * clic afuera y con Escape; ante scroll/resize se reposiciona desde el ancla.
 */
const ROW =
  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors disabled:opacity-50'

export function QuoteActionsMenu({
  onEdit,
  onPostal,
  onReflect,
  onDelete,
  reflectPending = false,
  canReflect = true,
}: {
  onEdit: () => void
  onPostal: () => void
  onReflect: () => void
  onDelete: () => void
  reflectPending?: boolean
  /** false cuando la cita ya tiene interpretación IA guardada. */
  canReflect?: boolean
}) {
  const popover = useAnchoredPopover()

  function run(fn: () => void) {
    popover.close()
    fn()
  }

  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={popover.toggle}
        aria-haspopup="menu"
        aria-expanded={popover.open}
        aria-label="Más acciones"
        title="Más acciones"
        className="p-1.5 rounded text-ink-300 hover:text-ink-700 hover:bg-ink-100 transition-colors"
      >
        <span aria-hidden className="block text-lead leading-none -mt-1">
          ⋯
        </span>
      </button>
      {popover.open &&
        popover.position &&
        createPortal(
          <div
            ref={popover.layerRef}
            role="menu"
            style={{
              position: 'fixed',
              top: popover.position.top,
              bottom: popover.position.bottom,
              right: popover.position.right,
            }}
            className="z-50 w-44 paper-grain rounded-xl border border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/15 p-1.5 animate-fade-up"
          >
            <button
              role="menuitem"
              onClick={() => run(onEdit)}
              className={`${ROW} text-ink-600 hover:text-ink-800 hover:bg-ink-100/60`}
            >
              Editar
            </button>
            <button
              role="menuitem"
              onClick={() => run(onPostal)}
              className={`${ROW} text-ink-600 hover:text-ink-800 hover:bg-ink-100/60`}
            >
              Lámina
            </button>
            {canReflect && (
              <button
                role="menuitem"
                onClick={() => run(onReflect)}
                disabled={reflectPending}
                className={`${ROW} text-[color:var(--accent-primary)] hover:text-[color:var(--accent-primary)] hover:bg-[color:var(--accent-primary-soft)]`}
              >
                <SparkleIcon size={12} />
                {reflectPending ? 'Leyendo…' : 'Reflexionar con IA'}
              </button>
            )}
            <div className="h-px bg-ink-100 my-1" />
            <button
              role="menuitem"
              onClick={() => run(onDelete)}
              className={`${ROW} text-[color:var(--accent-clay)] hover:text-[color:var(--accent-clay)] hover:bg-[color:var(--accent-clay-soft)]`}
            >
              <TrashIcon size={12} />
              Eliminar
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}
