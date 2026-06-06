import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Menú "⋯" reutilizable: un trigger discreto + un popover portado a
 * `document.body` con posición `fixed` (no se recorta dentro de columnas ni
 * contenedores con overflow). Se cierra al hacer clic afuera, con Escape y al
 * scrollear/redimensionar.
 *
 * `children` recibe `close` para cerrar el menú tras ejecutar cada acción.
 */
export function OverflowMenu({
  children,
  label = 'Más acciones',
  triggerClassName = 'p-1 rounded text-ink-300 hover:text-ink-700 hover:bg-ink-100 transition-colors',
  width = 'w-48',
  menuLayerClassName = 'z-50',
  triggerContent,
}: {
  children: (close: () => void) => ReactNode
  label?: string
  triggerClassName?: string
  width?: string
  /** Capa del popover portado. Algunos modales viven sobre `z-50`. */
  menuLayerClassName?: string
  /** Contenido del trigger. Por defecto, el glifo "⋯". */
  triggerContent?: ReactNode
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
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    }
    function onReflow() {
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onReflow, true)
    window.addEventListener('resize', onReflow)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onReflow, true)
      window.removeEventListener('resize', onReflow)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={triggerClassName}
      >
        {triggerContent ?? (
          <span aria-hidden className="block text-base leading-none -mt-1">
            ⋯
          </span>
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: pos.top, right: pos.right }}
            className={`${menuLayerClassName} ${width} paper-grain rounded-xl border border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/15 p-1.5 animate-fade-up`}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  )
}

/** Ítem estándar de un OverflowMenu. */
export function OverflowMenuItem({
  onClick,
  children,
  danger = false,
  disabled = false,
}: {
  onClick: () => void
  children: ReactNode
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors disabled:opacity-50 ${
        danger
          ? 'text-[color:var(--accent-clay)] hover:text-[color:var(--accent-clay)] hover:bg-[color:var(--accent-clay-soft)]'
          : 'text-ink-600 hover:text-ink-800 hover:bg-ink-100/60'
      }`}
    >
      {children}
    </button>
  )
}
