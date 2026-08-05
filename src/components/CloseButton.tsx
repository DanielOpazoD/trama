import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { CloseIcon } from './Icons'
import { IconButton } from './IconButton'

/**
 * Botón de CERRAR (la X de modales, overlays, lightboxes, popovers). Es el
 * sub-patrón de IconButton más repetido del repo (~50 sitios): siempre el mismo
 * `<CloseIcon/>` con un aria-label que casi siempre es "Cerrar". CloseButton lo
 * estandariza sobre IconButton:
 *   - ícono CloseIcon por defecto (tamaño 14, como el resto del UI);
 *   - `label` por defecto "Cerrar" — pasá uno más específico cuando aporte
 *     contexto ("Cerrar vista previa", "Cerrar lectura");
 *   - hereda de IconButton el contrato (type=button + aria-label + foco global).
 *
 * `forwardRef` NO es opcional acá, por la misma razón que en IconButton:
 * `Tooltip` clona su hijo y le inyecta un ref para medir dónde posicionarse.
 * Un wrapper sin forwardRef corta esa cadena un nivel más arriba — el tooltip
 * nunca abre y React avisa "Function components cannot be given refs".
 *
 * El LOOK (posición, padding, color, hover) queda en `className` del call site:
 * los cierres van desde un botón inline en un header hasta una X flotante en una
 * esquina, así que el primitivo no fija estética. Cualquier prop nativa de
 * <button> (onClick, disabled, title…) se reenvía.
 */
export const CloseButton = forwardRef<
  HTMLButtonElement,
  {
    /** Nombre accesible; por defecto "Cerrar". */
    label?: string
    /** Tamaño del ícono (default 14). */
    size?: number
  } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>
>(function CloseButton({ label = 'Cerrar', size = 14, className, ...rest }, ref) {
  return (
    <IconButton ref={ref} label={label} className={className} {...rest}>
      <CloseIcon size={size} />
    </IconButton>
  )
})
