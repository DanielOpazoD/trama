/**
 * Borde BROWSER-ONLY del editor de PDF: imprimir un PDF ya ensamblado.
 *
 * No hay API client-side para "imprimir un Blob" directamente, así que se carga
 * el PDF en un `<iframe>` (mismo origen vía blob URL, el visor nativo del navegador
 * lo renderiza) y se dispara `print()` sobre su ventana. Depende del navegador
 * (visor de PDF/iframe/print) → EXCLUIDO del coverage y mockeado en los tests.
 *
 * IMPORTANTE: el iframe NO puede ser `0×0` ni `visibility:hidden` — el visor de PDF
 * sólo pinta (y por lo tanto sólo hay algo que imprimir) si el iframe tiene tamaño
 * real y es "visible". Por eso se posiciona FUERA DE PANTALLA con tamaño tipo A4:
 * renderiza igual, el usuario no lo ve, y `print()` sí tiene contenido. El blob URL
 * debe seguir vivo durante el diálogo de impresión, así que se limpia tras
 * `afterprint` o un timeout de respaldo.
 */

/** Imprime un PDF (blob): lo carga en un iframe fuera de pantalla y llama a `print()`. */
export function printPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.title = 'Documento para imprimir'
  // Fuera de pantalla pero con TAMAÑO REAL (≈A4 @96dpi) → el visor de PDF renderiza.
  iframe.style.position = 'fixed'
  iframe.style.left = '-10000px'
  iframe.style.top = '0'
  iframe.style.width = '794px'
  iframe.style.height = '1123px'
  iframe.style.border = '0'
  iframe.style.pointerEvents = 'none'

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    URL.revokeObjectURL(url)
    iframe.remove()
  }

  iframe.onload = () => {
    const win = iframe.contentWindow
    if (!win) {
      cleanup()
      return
    }
    win.addEventListener?.('afterprint', cleanup)
    // Pequeño respiro para que el plugin de PDF termine de pintar antes de imprimir
    // (en algunos navegadores `print()` justo en `onload` sale en blanco).
    window.setTimeout(() => {
      try {
        win.focus()
        win.print()
      } catch {
        cleanup()
        return
      }
      // Respaldo: no todos los navegadores emiten `afterprint` en iframes.
      window.setTimeout(cleanup, 60_000)
    }, 350)
  }

  iframe.src = url
  document.body.appendChild(iframe)
}
