import { useEffect, useRef, useState } from 'react'
import { SparkleIcon, TrashIcon } from '../Icons'

/**
 * ρ-citas: menú "⋯" que agrupa las acciones secundarias de una cita
 * (Editar, Postal, Reflexionar con IA, Eliminar) en un solo control. Antes
 * vivían como 3-4 botones sueltos por cita — mucho ruido visual. Acá quedan
 * a un gesto, dejando el footer limpio (atribución + resonancia + favorita).
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
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function run(fn: () => void) {
    setOpen(false)
    fn()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Más acciones"
        title="Más acciones"
        className="p-1.5 rounded text-ink-300 hover:text-ink-700 hover:bg-ink-100 transition-colors"
      >
        <span aria-hidden className="block text-base leading-none -mt-1">
          ⋯
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-40 w-44 paper-grain rounded-xl border border-ink-100/60 bg-paper-50/95 backdrop-blur-md shadow-lg shadow-ink-900/10 p-1.5"
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
            Postal
          </button>
          {canReflect && (
            <button
              role="menuitem"
              onClick={() => run(onReflect)}
              disabled={reflectPending}
              className={`${ROW} text-sky-700/80 hover:text-sky-800 hover:bg-sky-50`}
            >
              <SparkleIcon size={12} />
              {reflectPending ? 'Leyendo…' : 'Reflexionar con IA'}
            </button>
          )}
          <div className="h-px bg-ink-100 my-1" />
          <button
            role="menuitem"
            onClick={() => run(onDelete)}
            className={`${ROW} text-red-700 hover:text-red-800 hover:bg-red-50`}
          >
            <TrashIcon size={12} />
            Eliminar
          </button>
        </div>
      )}
    </div>
  )
}
