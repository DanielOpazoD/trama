import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SparkleIcon, TrashIcon } from '../Icons'

/**
 * ρ-citas: menú "⋯" que agrupa las acciones secundarias de una cita
 * (Editar, Lámina, Reflexionar con IA, Eliminar) en un solo control.
 *
 * El popover se renderiza con `createPortal` a `document.body` y se posiciona
 * con coordenadas `fixed` calculadas desde el botón — así flota libre y NO se
 * recorta dentro de la columna de lectura (`max-w-3xl`). Se cierra al hacer
 * clic afuera, con Escape, y al scrollear/redimensionar (la posición fija
 * quedaría desfasada).
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
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onReflow() {
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onReflow, true)
    window.addEventListener('resize', onReflow)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onReflow, true)
      window.removeEventListener('resize', onReflow)
    }
  }, [open])

  function run(fn: () => void) {
    setOpen(false)
    fn()
  }

  return (
    <>
      <button
        ref={triggerRef}
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
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: pos.top, right: pos.right }}
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
