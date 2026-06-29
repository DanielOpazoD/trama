import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useModalOverlay } from '../hooks/useModalOverlay'
import { CloseButton } from './CloseButton'

/**
 * Overlay + diálogo modal genérico. Generaliza el ModalShell que vivía solo en
 * `momentos/editModal/shell.tsx` para que los ~14 modales del repo dejen de
 * recopiar createPortal + backdrop + caja de diálogo + header: eran 50–110 LOC
 * de markup casi idéntico cada uno, con z-index y opacidad de backdrop que
 * habían divergido (`z-[120]/z-[130]` en momentos, `z-50` en QuoteEditModal).
 *
 * Delega focus-trap, Escape-to-close, scroll-lock y restauración de foco a
 * `useModalOverlay`. Usa los tokens de z-index SEMÁNTICOS (`z-overlay` para el
 * backdrop, `z-modal` para el diálogo) en vez de valores ad-hoc.
 *
 * El modal se monta SOLO cuando está visible: el call site renderiza
 * `<ModalShell>` de forma condicional (típicamente `if (!open) return null`
 * antes del return), por eso el hook recibe `open: true` mientras vive.
 */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
}

export function ModalShell({
  ariaLabel,
  eyebrow,
  title,
  size = 'md',
  onClose,
  showClose = false,
  lockScroll = true,
  dialogClassName,
  children,
}: {
  /** Nombre accesible del diálogo (`role="dialog"` + `aria-label`). */
  ariaLabel: string
  /** Línea superior en small-caps doradas. Opcional. */
  eyebrow?: string
  /** Título serif. Opcional (algunos modales traen su propio header interno). */
  title?: ReactNode
  size?: ModalSize
  onClose: () => void
  /** Muestra una X (CloseButton) arriba a la derecha del header. */
  showClose?: boolean
  /** Bloquea el scroll del body (default true). */
  lockScroll?: boolean
  /** Clases extra para la caja del diálogo (p. ej. una altura fija). */
  dialogClassName?: string
  children: ReactNode
}) {
  const overlay = useModalOverlay({ open: true, onClose, lockScroll })
  const hasHeader = Boolean(eyebrow || title || showClose)

  return createPortal(
    <div data-modal-root="">
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        tabIndex={-1}
        className="fixed inset-0 z-overlay bg-ink-900/50 backdrop-blur-sm cursor-default animate-fade-up"
      />
      <div className="fixed inset-0 z-modal flex items-center justify-center px-4 pointer-events-none animate-fade-up">
        <div
          ref={overlay.dialogRef}
          role="dialog"
          aria-label={ariaLabel}
          aria-modal="true"
          className={[
            'pointer-events-auto w-full max-h-[90vh] overflow-y-auto border border-ink-100/80 rounded-xl shadow-xl shadow-ink-900/25',
            SIZE_CLASS[size],
            dialogClassName,
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ backgroundColor: 'rgb(var(--paper-50))' }}
        >
          {hasHeader && (
            <header className="px-5 py-3 border-b border-ink-100/60 flex items-start justify-between gap-3">
              {(eyebrow || title) && (
                <div className="min-w-0">
                  {eyebrow && (
                    <p className="section-eyebrow-serif" style={{ color: 'var(--accent-gold)' }}>
                      {eyebrow}
                    </p>
                  )}
                  {title && (
                    <h3 className="font-serif text-xl text-ink-800 leading-tight mt-1">{title}</h3>
                  )}
                </div>
              )}
              {showClose && (
                <CloseButton
                  onClick={onClose}
                  className="shrink-0 -mr-1 -mt-0.5 p-1 text-ink-300 hover:text-ink-600 transition-colors"
                />
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
    <div className="px-5 py-3 border-t border-ink-100/60 flex justify-end gap-3">{children}</div>
  )
}
