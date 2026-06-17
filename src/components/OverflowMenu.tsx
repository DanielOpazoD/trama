import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPopover } from '../hooks/useAnchoredPopover'

function zIndexFromClassName(className: string): number | undefined {
  if (className.includes('z-[80]')) return 80
  if (className.includes('z-50')) return 50
  const arbitrary = className.match(/z-\[(\d+)\]/)?.[1]
  if (arbitrary) return Number(arbitrary)
  const scale = className.match(/\bz-(\d+)\b/)?.[1]
  return scale ? Number(scale) : undefined
}

/**
 * Menú "⋯" reutilizable: un trigger discreto + un popover portado a
 * `document.body` con posición `fixed` (no se recorta dentro de columnas ni
 * contenedores con overflow). Se cierra al hacer clic afuera y con Escape; ante
 * scroll/resize recalcula su ancla para no desmontarse durante reflows.
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
  const popover = useAnchoredPopover()

  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={popover.toggle}
        aria-haspopup="menu"
        aria-expanded={popover.open}
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
              // Si el viewport es muy bajo, el menú no debe desbordar: scrollea.
              maxHeight: '80vh',
              overflowY: 'auto',
              zIndex: zIndexFromClassName(menuLayerClassName),
            }}
            className={`${menuLayerClassName} ${width} paper-grain rounded-xl border border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/15 p-1.5 animate-fade-up`}
          >
            {children(popover.close)}
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
