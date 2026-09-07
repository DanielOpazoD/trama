/**
 * Vigía de arranque: convierte una pantalla en blanco en un mensaje legible.
 *
 * POR QUÉ EXISTE
 *
 * Producción estuvo servida y rota: dos chunks del bundle se importaban en
 * ciclo, el módulo de entrada reventaba antes de montar React y el usuario
 * veía una página blanca, sin texto, sin botón y sin pista. Nada en la app
 * podía avisar, porque el fallo ocurría ANTES de que la app existiera.
 *
 * Este archivo vive en `public/`: se sirve tal cual, no pasa por el bundler y
 * no importa nada. Por eso sobrevive a cualquier fallo del grafo de módulos
 * de la app —que es justo cuando hace falta—. También cubre los otros motivos
 * de blanco: un chunk que no se descarga, un proveedor de sesión que no
 * arranca (Clerk rechaza sus claves fuera del dominio autorizado), un
 * navegador que bloquea el script.
 *
 * NO reemplaza al ErrorBoundary de React, que atiende los fallos de dentro
 * del árbol. Éste atiende el caso en que no hay árbol.
 */
;(function () {
  // Plazo generoso: con la carga inicial en ~194 KB gzip, diez segundos sin
  // un solo nodo dentro de #root ya no es «va lento», es «no va a montar».
  var PLAZO_MS = 10000
  var PANEL_ID = 'trama-arranque-fallido'

  var raiz = document.getElementById('root')
  if (!raiz) return

  function montada() {
    return raiz.childElementCount > 0
  }

  /** Deja rastro en el log de errores del servidor. Best-effort y una sola vez. */
  function reportar() {
    try {
      var cuerpo = JSON.stringify({
        message: '[arranque] #root siguió vacío ' + PLAZO_MS / 1000 + ' s tras cargar',
        stack: null,
        path: window.location.pathname,
        userAgent: navigator.userAgent,
      })
      if (typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(
          '/api/error-log',
          new Blob([cuerpo], { type: 'application/json' }),
        )
      }
    } catch {
      // El aviso nunca puede ser el que rompa la pantalla de aviso.
    }
  }

  function panel() {
    var caja = document.createElement('div')
    caja.id = PANEL_ID
    caja.setAttribute('role', 'alert')
    caja.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:1rem;padding:2rem;text-align:center;' +
      'background:#fbfbfa;color:#27272a;font-family:Spectral,Georgia,serif'

    var titulo = document.createElement('h1')
    titulo.textContent = 'Trama no llegó a abrirse'
    titulo.style.cssText =
      'margin:0;font-size:1.5rem;font-weight:400;letter-spacing:-0.01em'

    var texto = document.createElement('p')
    texto.textContent =
      'Algo falló al iniciar la aplicación en este navegador. Recargar suele bastar.'
    texto.style.cssText =
      'margin:0;max-width:32rem;line-height:1.6;color:#52525b;' +
      'font-family:Inter,system-ui,sans-serif;font-size:0.9375rem'

    var boton = document.createElement('button')
    boton.type = 'button'
    boton.textContent = 'Recargar'
    boton.style.cssText =
      'margin-top:0.5rem;padding:0.5rem 1.25rem;border:0;border-radius:0.375rem;cursor:pointer;' +
      'background:#27272a;color:#fbfbfa;font-family:Inter,system-ui,sans-serif;font-size:0.875rem'
    boton.addEventListener('click', function () {
      window.location.reload()
    })

    caja.appendChild(titulo)
    caja.appendChild(texto)
    caja.appendChild(boton)
    return caja
  }

  var temporizador = window.setTimeout(function () {
    if (montada() || document.getElementById(PANEL_ID)) return
    document.body.appendChild(panel())
    reportar()
  }, PLAZO_MS)

  // Si la app monta —antes o después del plazo— no hay nada que anunciar: se
  // cancela el aviso y se retira el panel si ya estaba puesto.
  var observador = new MutationObserver(function () {
    if (!montada()) return
    window.clearTimeout(temporizador)
    observador.disconnect()
    var puesto = document.getElementById(PANEL_ID)
    if (puesto) puesto.remove()
  })
  observador.observe(raiz, { childList: true })
})()
