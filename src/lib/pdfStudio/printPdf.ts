/**
 * Borde BROWSER-ONLY del editor de PDF: abrir la ventana de impresión de un PDF
 * ya ensamblado.
 *
 * No hay API client-side para "imprimir un Blob" directamente, así que se carga el
 * PDF en un `<iframe>` (mismo origen vía blob URL, el visor nativo del navegador lo
 * renderiza) y se dispara `print()` sobre su ventana. Requiere `frame-src 'self'
 * blob:` en el CSP (ver `netlify.toml`); sin eso el frame queda bloqueado.
 *
 * IMPORTANTE: el iframe NO puede ser `0×0` ni `visibility:hidden` — el visor de PDF
 * sólo pinta (y por lo tanto sólo hay algo que imprimir) si el iframe tiene tamaño
 * real y es "visible". Por eso se posiciona FUERA DE PANTALLA con tamaño tipo A4.
 *
 * FALLBACK: si el iframe no puede imprimir (CSP, visor bloqueado, navegador sin
 * soporte), se abre el PDF en una PESTAÑA NUEVA para que el usuario igual pueda
 * guardarlo/imprimirlo desde el visor. Depende del navegador → excluido del
 * coverage y mockeado en los tests.
 */

/** Abre la impresión de un PDF (blob): iframe fuera de pantalla → `print()`; si
 *  algo lo bloquea, lo abre en una pestaña nueva. */
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

  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    URL.revokeObjectURL(url)
    iframe.remove()
  }
  // Plan B: abrir el PDF en una pestaña nueva (el url debe seguir vivo un rato).
  const fallback = () => {
    if (done) return
    done = true
    iframe.remove()
    const opened = window.open(url, '_blank')
    if (opened) window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    else URL.revokeObjectURL(url)
  }

  iframe.onerror = fallback
  iframe.onload = () => {
    try {
      const win = iframe.contentWindow
      if (!win) return fallback()
      win.addEventListener?.('afterprint', cleanup)
      // Pequeño respiro para que el plugin de PDF termine de pintar antes de imprimir
      // (en algunos navegadores `print()` justo en `onload` sale en blanco).
      window.setTimeout(() => {
        try {
          win.focus()
          win.print()
          // Respaldo: no todos los navegadores emiten `afterprint` en iframes.
          window.setTimeout(cleanup, 60_000)
        } catch {
          fallback()
        }
      }, 350)
    } catch {
      fallback()
    }
  }

  iframe.src = url
  document.body.appendChild(iframe)
}
