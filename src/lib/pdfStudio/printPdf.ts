/**
 * Borde BROWSER-ONLY del editor de PDF: imprimir un PDF ya ensamblado.
 *
 * No hay API client-side para "imprimir un Blob" directamente, así que se carga
 * el PDF en un `<iframe>` oculto (mismo origen vía blob URL, el visor nativo del
 * navegador lo renderiza) y se dispara `print()` sobre su ventana. Es el patrón
 * estándar; depende del navegador (canvas/iframe/print) → EXCLUIDO del coverage y
 * mockeado en los tests del componente.
 *
 * El blob URL debe seguir vivo mientras dura el diálogo de impresión; no hay un
 * evento fiable de "cierre", así que se limpia tras una espera amplia.
 */

/** Imprime un PDF (blob) abriéndolo en un iframe oculto y llamando a `print()`. */
export function printPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.visibility = 'hidden'

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    URL.revokeObjectURL(url)
    iframe.remove()
  }

  iframe.onload = () => {
    try {
      const win = iframe.contentWindow
      if (!win) {
        cleanup()
        return
      }
      win.focus()
      // Limpia cuando la ventana de impresión termina (si el navegador lo emite).
      win.addEventListener('afterprint', cleanup)
      win.print()
    } catch {
      // Si algo falla (navegador sin visor de PDF, bloqueo), no dejamos basura.
      cleanup()
      return
    }
    // Respaldo: revoca el blob y saca el iframe tras un margen amplio aunque no
    // llegue `afterprint` (no todos los navegadores lo disparan en iframes).
    window.setTimeout(cleanup, 60_000)
  }

  iframe.src = url
  document.body.appendChild(iframe)
}
