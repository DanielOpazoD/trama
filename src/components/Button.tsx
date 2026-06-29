import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Botón con TEXTO (acciones: guardar, enviar, cancelar). Centraliza el patrón
 * que estaba disperso entre la clase `.btn-accent` (~33 sitios) y copias inline
 * del botón primario (`bg-ink-900 text-paper-50 …`) que habían derivado del
 * canónico. Igual que IconButton, impone el CONTRATO y no estética propia:
 *   - `type="button"` por defecto (un <button> sin type dentro de un <form>
 *     envía el formulario sin querer);
 *   - cada `variant` mapea 1:1 a una clase YA existente en `src/index.css`
 *     (.btn-accent / .btn-ink / .btn-ghost) o, para 'quiet', al patrón textual
 *     de cancelar (section-eyebrow). No inventa estilos nuevos.
 *
 * NO hornea anillo de foco: la app ya tiene un `*:focus-visible` global; un ring
 * propio duplicaría el outline (doble indicador).
 *
 * `loading` deshabilita el botón y marca `aria-busy`; si pasás `loadingLabel`
 * muestra ese texto (patrón "guardando…") en vez de `children`.
 *
 * El `className` del call site se concatena DESPUÉS de la clase de la variante,
 * así que sigue permitiendo ajustes locales (ancho, margen, `text-xs`, etc.).
 */
export type ButtonVariant = 'accent' | 'ink' | 'ghost' | 'quiet'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  accent: 'btn-accent',
  ink: 'btn-ink',
  ghost: 'btn-ghost',
  quiet:
    'section-eyebrow hover:text-ink-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
}

export function Button({
  variant = 'accent',
  loading = false,
  loadingLabel,
  children,
  className,
  type = 'button',
  disabled,
  ...rest
}: {
  /** Mapea a una clase de botón existente. Default 'accent' (.btn-accent). */
  variant?: ButtonVariant
  /** Deshabilita + aria-busy; con `loadingLabel` reemplaza el contenido. */
  loading?: boolean
  loadingLabel?: ReactNode
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  const classes = [VARIANT_CLASS[variant], className].filter(Boolean).join(' ')
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && loadingLabel != null ? loadingLabel : children}
    </button>
  )
}
