import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Ola transversal 2026-06: "imprimir como objeto". Monta una hoja tipografiada
 * en un portal FUERA de #root y dispara el diálogo de impresión del navegador;
 * el CSS (`html.print-object-active` en index.css) oculta la app entera y deja
 * solo la hoja — el papel sale como objeto editorial, no como screenshot del
 * DOM.
 *
 * En pantalla la hoja no se ve nunca (display:none fuera de @media print).
 * `onDone` se llama en afterprint (cerrar o imprimir, da igual): el caller
 * desmonta. Si un navegador exótico no emite afterprint, el estado queda
 * inocuo — la app sigue intacta en pantalla.
 */
export function PrintObject({
  children,
  onDone,
}: {
  children: ReactNode
  onDone: () => void
}) {
  useEffect(() => {
    document.documentElement.classList.add('print-object-active')
    window.addEventListener('afterprint', onDone)
    // Un tick para que el portal pinte antes del snapshot de impresión.
    const t = window.setTimeout(() => window.print(), 80)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('afterprint', onDone)
      document.documentElement.classList.remove('print-object-active')
    }
  }, [onDone])

  return createPortal(<div className="print-object">{children}</div>, document.body)
}
