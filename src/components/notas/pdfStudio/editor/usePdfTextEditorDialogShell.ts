import { useEffect, useRef } from 'react'
import { useFocusTrap } from '../../../../hooks/useFocusTrap'

/**
 * El cascarón del diálogo del editor: foco atrapado, foco inicial y fuentes
 * calientes. No sabe nada de anotaciones ni de páginas — por eso vive aparte
 * de `PdfTextEditor`, que ya carga con la edición entera.
 *
 * El inspector flotante se portalea al body (se puede arrastrar fuera del
 * modal), así que el focus trap tiene que contarlo como parte del editor: de
 * ahí que devuelva su ref además de la del diálogo.
 */
export function usePdfTextEditorDialogShell() {
  const dialogRef = useRef<HTMLDivElement>(null)
  const floatingToolsRef = useRef<HTMLDivElement>(null)
  const focusTrapRoots = useRef([floatingToolsRef]).current

  useFocusTrap(dialogRef, true, focusTrapRoots)

  useEffect(() => {
    dialogRef.current?.focus()
    // Calienta las fuentes del menú de estilo. Caveat ("Manuscrita") puede no
    // haberse usado aún en esta sesión: si se descargara recién al abrir el
    // menú, el reflow de la carga dispara el cierre-por-scroll del popover.
    void document.fonts?.load?.('16px Caveat')?.catch(() => {})
  }, [])

  return { dialogRef, floatingToolsRef }
}
