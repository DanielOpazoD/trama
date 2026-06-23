import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Botón de SOLO ÍCONO. Centraliza el CONTRATO que en los ~250 botones de ícono
 * del repo estaba disperso e inconsistente:
 *   - `type="button"` por defecto (un <button> sin type dentro de un <form>
 *     envía el formulario sin querer);
 *   - nombre accesible OBLIGATORIO (`label` → aria-label): el tipo no compila
 *     si falta, así que un botón de ícono nunca queda sin nombre para lectores
 *     de pantalla.
 *
 * NO impone un anillo de foco propio: la app ya tiene un `*:focus-visible`
 * global (outline accent-primary, salvia dentro de .pdf-studio) en src/index.css
 * que cubre todo elemento enfocable. Hornear un ring acá duplicaría ese outline
 * (doble indicador) y rompería la consistencia del foco en toda la app.
 *
 * El ÍCONO va como children y el LOOK (tamaño, color, posición, hover) queda en
 * `className` del call site: el primitivo no impone estética, solo el contrato
 * de accesibilidad. Cualquier prop nativa de <button> (onClick, disabled,
 * title, aria-*, etc.) se reenvía.
 */
export function IconButton({
  label,
  children,
  className,
  type = 'button',
  ...rest
}: {
  /** Nombre accesible del botón (obligatorio: es solo-ícono). */
  label: string
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>) {
  return (
    <button type={type} aria-label={label} className={className} {...rest}>
      {children}
    </button>
  )
}
