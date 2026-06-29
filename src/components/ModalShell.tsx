import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useModalOverlay } from '../hooks/useModalOverlay'

/**
 * Overlay + diálogo modal genérico. Generaliza el ModalShell que vivía solo en
 * `momentos/editModal/shell.tsx` para que los modales con layout de diálogo
 * estándar dejen de recopiar createPortal + backdrop + caja + header (eran
 * 50–110 LOC casi idénticos, con z-index y opacidad de backdrop divergentes).
 *
 * Delega focus-trap, Escape-to-close, scroll-lock y restauración de foco a
 * `useModalOverlay`. Usa los tokens de z-index SEMÁNTICOS (`z-overlay` backdrop,
 * `z-modal` diálogo) y respeta `prefers-reduced-motion`.
 *
 * La superficie se mantiene MÍNIMA a propósito (solo lo que los call-sites usan
 * hoy). Cuando un modal real necesite una X de cierre, un ancho mayor o clases
 * extra en la caja, se agregan esos props EN ESE MOMENTO, con su primer uso real
 * — no antes.
 *
 * El modal se monta SOLO cuando está visible: el call site renderiza
 * `<ModalShell>` de forma condicional (típicamente `if (!open) return null`
 * antes del return), por eso el hook recibe `open: true` mientras vive.
 */
export type ModalSize = 'sm' | 'md'

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
}

export function ModalShell({
  ariaLabel,
  eyebrow,
  eyebrowColor = 'var(--accent-gold)',
  title,
  size = 'md',
  onClose,
  lockScroll = true,
  children,
}: {
  /** Nombre accesible del diálogo (`role="dialog"` + `aria-label`). */
  ariaLabel: string
  /** Línea superior en small-caps. Opcional. */
  eyebrow?: string
  /** Color del eyebrow (default oro). Permite conservar el acento de sección. */
  eyebrowColor?: string
  /** Título serif. Opcional (algunos modales traen su propio header interno). */
  title?: ReactNode
  size?: ModalSize
  onClose: () => void
  /** Bloquea el scroll del body (default true). */
  lockScroll?: boolean
  children: ReactNode
}) {
  const overlay = useModalOverlay({ open: true, onClose, lockScroll })
  const hasHeader = Boolean(eyebrow || title)

  return createPortal(
    <div data-modal-root="">
      {/* Backdrop con opacidad /40 unificada: antes divergía (/30 en biblioteca,
          /40 en momentos, /60 en citas). /40 es el valor del editor de momentos,
          el que mejor equilibra atenuar el fondo sin oscurecer de más. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        tabIndex={-1}
        className="fixed inset-0 z-overlay bg-ink-900/40 backdrop-blur-sm cursor-default animate-fade-up motion-reduce:animate-none"
      />
      <div className="fixed inset-0 z-modal flex items-center justify-center px-4 pointer-events-none animate-fade-up motion-reduce:animate-none">
        <div
          ref={overlay.dialogRef}
          role="dialog"
          aria-label={ariaLabel}
          aria-modal="true"
          className={`pointer-events-auto w-full ${SIZE_CLASS[size]} max-h-[90vh] overflow-y-auto border border-ink-100/80 rounded-xl shadow-xl shadow-ink-900/25`}
          style={{ backgroundColor: 'rgb(var(--paper-50))' }}
        >
          {hasHeader && (
            <header className="px-5 py-3 border-b border-ink-100/60">
              {eyebrow && (
                <p className="section-eyebrow-serif" style={{ color: eyebrowColor }}>
                  {eyebrow}
                </p>
              )}
              {title && (
                <h3 className="font-serif text-xl text-ink-800 leading-tight mt-1">
                  {title}
                </h3>
              )}
            </header>
          )}
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Pie de modal: separador superior + acciones alineadas a la derecha. */
export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 py-3 border-t border-ink-100/60 flex justify-end gap-3">
      {children}
    </div>
  )
}
