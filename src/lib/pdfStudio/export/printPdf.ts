/**
 * Borde BROWSER-ONLY de "Guardar PDF": abre el PDF ya ensamblado en el VISOR
 * NATIVO del navegador (pestaña nueva), donde los botones de **imprimir** y
 * **guardar como PDF** del propio visor SÍ funcionan de forma confiable en todos
 * los navegadores.
 *
 * Reemplaza al viejo truco del `<iframe>` oculto + `contentWindow.print()`: el
 * visor de PDF corre como un plugin fuera del control de la página, así que ese
 * `print()` programático muchas veces no hacía nada o imprimía en blanco (de ahí
 * que "Guardar PDF" pareciera roto, mientras el botón de imprimir DENTRO del visor
 * sí andaba). Acá no peleamos con `print()`: mostramos el visor y dejamos que el
 * usuario use su botón nativo.
 *
 * La pestaña se abre en DOS pasos para esquivar el bloqueador de pop-ups:
 * `openBlankPdfTab()` debe llamarse SINCRÓNICAMENTE dentro del gesto del usuario
 * (el clic), ANTES de `await assemble(...)`; cuando el PDF está listo,
 * `showPdfInTab()` dirige esa pestaña al blob. Excluido del coverage (depende del
 * navegador) y mockeado en los tests.
 */

/** Abre una pestaña en blanco con un placeholder. Llamar dentro del gesto del
 *  usuario (antes de cualquier `await`) para que no la bloquee el pop-up blocker. */
export function openBlankPdfTab(): Window | null {
  const tab = window.open('', '_blank')
  if (tab) {
    try {
      tab.document.write(
        '<!doctype html><html><head><meta charset="utf-8"><title>Preparando PDF…</title></head>' +
          '<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;color:#6b6b6b;' +
          'display:grid;place-items:center;height:100vh">Preparando tu PDF…</body></html>',
      )
      tab.document.close()
    } catch {
      // about:blank es mismo-origen, no debería fallar; si falla, igual sirve.
    }
  }
  return tab
}

/**
 * Dirige una pestaña ya abierta (`openBlankPdfTab`) al PDF ensamblado. Si la
 * pestaña no existe (pop-up bloqueado o entorno sin `window.open`), ejecuta el
 * plan B (`onBlocked`, típicamente una descarga directa).
 */
export function showPdfInTab(
  tab: Window | null,
  blob: Blob,
  onBlocked: () => void,
): void {
  if (!tab) {
    onBlocked()
    return
  }
  const url = URL.createObjectURL(blob)
  tab.location.href = url
  // El visor necesita el object URL vivo un rato; se revoca con holgura.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
