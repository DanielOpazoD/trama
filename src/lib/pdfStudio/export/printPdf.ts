/**
 * Imprime un PDF ya ensamblado SIN salir de la app (sin pestaña nueva): monta un
 * `<iframe>` oculto con el blob, espera a que el visor del navegador termine de
 * pintarlo y dispara el diálogo de impresión, donde el usuario elige "Guardar
 * como PDF" o una impresora real.
 *
 * Esperar `onload` (+ un pequeño respiro) antes de `print()` evita el viejo bug
 * de "imprime en blanco" (se imprimía antes de que el plugin de PDF cargara).
 * Browser-only — verificado en navegador, excluido del coverage.
 */
export function printPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '1px'
  iframe.style.height = '1px'
  iframe.style.opacity = '0'
  iframe.style.border = '0'

  iframe.addEventListener('load', () => {
    window.setTimeout(() => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } catch {
        // Algún navegador puede bloquear print() programático del plugin PDF;
        // el modal igual ofrece "Descargar" como salida garantizada.
      }
    }, 250)
  })

  iframe.src = url
  document.body.appendChild(iframe)

  // Cleanup holgado: el diálogo de impresión es modal; cuando se cierra,
  // limpiamos el iframe y revocamos el object URL. 60s cubre de sobra.
  window.setTimeout(() => {
    iframe.remove()
    URL.revokeObjectURL(url)
  }, 60_000)
}
