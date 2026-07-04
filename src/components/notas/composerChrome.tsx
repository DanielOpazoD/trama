import type { CSSProperties, DragEvent, ReactNode } from 'react'

/**
 * Chrome COMPARTIDO de los composers del mundo Notas (feed de capturas y
 * biblioteca de prompts): la misma tarjeta de papel que se enciende con el
 * acento al enfocar, el mismo título serif desnudo y el mismo pie sereno.
 * Un solo lenguaje para todos los cuadros donde se escribe.
 */

/** Título del composer: serif desnudo sobre el papel, sin caja. */
export const composerTitleClass =
  'w-full bg-transparent font-serif text-lead text-ink-800 placeholder:font-sans placeholder:not-italic placeholder:text-ink-300 mb-1 animate-fade-up'

/** Acción de ícono del pie (adjuntar, capturar…): mismo gesto en todos. */
export const composerIconButtonClass =
  'flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100/60 hover:text-ink-700 disabled:opacity-40'

/** Marco de una tarjeta EN EDICIÓN: apenas un borde GRIS-VERDE apagado con un
 *  halo mínimo — la señal de «estás editando» sin el verde saturado que
 *  distrae al leer/escribir. El campo interno tampoco dibuja su propio anillo
 *  de foco, así el marco es UNO solo, no dos. */
export function editingFrameStyle(): CSSProperties {
  return {
    borderColor: 'rgb(122 134 116 / 0.6)',
    boxShadow: '0 0 0 1px rgb(122 134 116 / 0.12)',
  }
}

/** Tarjeta del composer: papel suave en reposo, marco de acento + halo al
 *  enfocar, borde punteado al arrastrar archivos encima. El blur interno
 *  (foco moviéndose entre campos) no la "apaga". */
export function ComposerCard({
  accent,
  accentSoft,
  focused,
  dragging = false,
  className = '',
  onFocusWithin,
  onBlurWithin,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: {
  accent: string
  accentSoft: string
  focused: boolean
  dragging?: boolean
  className?: string
  onFocusWithin: () => void
  onBlurWithin: () => void
  onDragOver?: (event: DragEvent<HTMLElement>) => void
  onDragLeave?: () => void
  onDrop?: (event: DragEvent<HTMLElement>) => void
  children: ReactNode
}) {
  return (
    <section
      onFocusCapture={onFocusWithin}
      onBlurCapture={(event) => {
        // El foco moviéndose DENTRO (título → adjuntar) no pliega el composer:
        // con los campos vacíos desmontaría el botón antes de que llegue el clic.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        onBlurWithin()
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`card-paper-soft relative rounded-xl border p-3 transition ${
        dragging ? 'border-dashed' : 'border-ink-100/70'
      } ${className}`}
      style={
        dragging
          ? { borderColor: accent, background: accentSoft }
          : focused
            ? { borderColor: accent, boxShadow: `0 0 0 3px ${accentSoft}` }
            : undefined
      }
    >
      {children}
    </section>
  )
}

/** Pie sereno del composer: UNA fila — acciones de ícono y campos sutiles a
 *  la izquierda (slot `children`) con su pista, y el CTA a la derecha con el
 *  ripple de «guardado» en el acento del mundo. */
export function ComposerFooter({
  accent,
  hint,
  ctaLabel,
  ctaDisabled,
  justSaved = false,
  secondaryLabel,
  onSecondary,
  onSave,
  children,
}: {
  accent: string
  hint?: string
  ctaLabel: string
  ctaDisabled: boolean
  justSaved?: boolean
  secondaryLabel?: string
  onSecondary?: () => void
  onSave: () => void
  children?: ReactNode
}) {
  return (
    <div className="mt-2 flex items-center justify-between gap-3 border-t border-ink-100/60 pt-2 animate-fade-up">
      <div className="flex min-w-0 items-center gap-0.5">
        {children}
        {hint && (
          <span className="ml-1.5 hidden min-w-0 truncate text-micro text-ink-300 sm:block">
            {hint}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {secondaryLabel && onSecondary && (
          <button onClick={onSecondary} className="btn-ghost text-xs">
            {secondaryLabel}
          </button>
        )}
        <span className="relative">
          <button
            onClick={onSave}
            disabled={ctaDisabled}
            className="btn-ink text-xs disabled:opacity-40"
          >
            {ctaLabel}
          </button>
          {justSaved && (
            <span
              aria-hidden
              className="animate-saved-ripple pointer-events-none absolute inset-0 rounded-md"
              style={{ boxShadow: `0 0 0 2px ${accent}` }}
            />
          )}
        </span>
      </div>
    </div>
  )
}
