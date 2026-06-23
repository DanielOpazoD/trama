import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Botón de SOLO ÍCONO. Centraliza tres cosas que en los ~250 botones de ícono
 * del repo estaban dispersas e inconsistentes:
 *   - `type="button"` por defecto (un <button> sin type dentro de un <form>
 *     envía el formulario sin querer);
 *   - nombre accesible OBLIGATORIO (`label` → aria-label): el tipo no compila
 *     si falta, así que un botón de ícono nunca queda sin nombre para lectores
 *     de pantalla;
 *   - un anillo de foco de teclado consistente (focus-visible): muchos botones
 *     solo tenían `hover:` y eran invisibles al navegar con Tab.
 *
 * El ÍCONO va como children y el LOOK (tamaño, color, posición, hover) queda en
 * `className` del call site: el primitivo no impone estética, solo el contrato
 * de accesibilidad. Cualquier prop nativa de <button> (onClick, disabled,
 * title, aria-*, etc.) se reenvía.
 */
export function IconButton({
  label,
  children,
  className = '',
  type = 'button',
  ...rest
}: {
  /** Nombre accesible del botón (obligatorio: es solo-ícono). */
  label: string
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>) {
  return (
    <button
      type={type}
      aria-label={label}
      className={`focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-300 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
