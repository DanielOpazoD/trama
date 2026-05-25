import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

/**
 * τ-mobile-bridge: modal con un código QR que abre el composer de
 * Momentos directo en modo Foto al escanearlo desde el celular.
 *
 * Caso de uso: el usuario está en desktop, quiere sumar una foto del
 * día. En vez de transferir archivos, escanea el QR con el celular y
 * la app se abre en `momentos` con el tab Foto activo. Desde ahí
 * usa la cámara nativa o el rollo del celular.
 *
 * Implementación:
 *   - `qrcode` se importa dinámicamente al abrir el modal — no carga
 *     en el bundle inicial, ~30kb se traen solo cuando hace falta.
 *   - La URL apunta a `${origin}/?view=momentos&compose=foto`. App.tsx
 *     lee `view` al mount inicial; MomentosView lee `compose` y se lo
 *     pasa a useMomentoComposer.
 *   - El usuario también puede copiar la URL textual debajo del QR
 *     (algunos celulares no escanean bien con poca luz / pantalla).
 */
export function MomentoQRModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, open)

  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?view=momentos&compose=foto`
      : ''

  useEffect(() => {
    if (!open) {
      setSvgMarkup(null)
      setError(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        // Dynamic import — qrcode (~30kb) solo se carga cuando el usuario
        // abre este modal. Al cerrar/recargar queda en cache del bundle
        // pero no penaliza el time-to-interactive inicial.
        const QR = await import('qrcode')
        const svg = await QR.toString(url, {
          type: 'svg',
          errorCorrectionLevel: 'M',
          margin: 1,
          color: { dark: '#262626', light: '#00000000' },
        })
        if (!cancelled) setSvgMarkup(svg)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo generar el QR')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, url])

  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  function handleCopy() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard.writeText(url).catch(() => {
      /* clipboard denied — copiar manualmente */
    })
  }

  if (!open) return null

  return (
    <>
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-sm cursor-default animate-fade-up"
        tabIndex={-1}
      />
      {/* υ-bugfix: contenedor con flex centering en lugar de
          top-1/2 + translate. Razones:
          1. Centro robusto con altura variable del contenido (sin
             salirse por arriba cuando el QR + textos son altos).
          2. max-h-[90vh] + overflow-y-auto evita que el modal nunca
             quede cortado en pantallas chicas.
          El z-50 va arriba del backdrop (z-40), antes era ambos al
          mismo nivel y ciertos browsers renderizaban inconsistente.
          pointer-events-none en el wrapper + auto en el dialog deja
          que el backdrop reciba los clicks fuera del modal. */}
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none animate-fade-up">
        <div
          ref={dialogRef}
          role="dialog"
          aria-label="Escanear con el celular"
          aria-modal="true"
          className="pointer-events-auto w-full max-w-sm max-h-[90vh] overflow-y-auto bg-paper-50 border border-ink-100/80 rounded-xl shadow-xl shadow-ink-900/25"
          style={{
            // υ-bugfix: forzamos background-color sólido inline porque
            // el ::before del .paper-grain global proyecta un overlay
            // SVG noise sobre todo lo que herede el padding, y con el
            // shadow-lg + backdrop-blur del wrapper algunos browsers
            // dejaban "ver" el grain de atrás. Color directo desde la
            // CSS var → siempre opaco en cualquier theme.
            backgroundColor: 'rgb(var(--paper-50))',
          }}
        >
          <header className="px-5 py-3 border-b border-ink-100/60">
            <p
              className="section-eyebrow-serif"
              style={{ color: 'var(--accent-gold)' }}
            >
              desde el celular
            </p>
            <h3 className="font-serif text-xl text-ink-800 leading-tight mt-1">
              Escanear y subir foto
            </h3>
          </header>

          <div className="px-5 py-6 flex flex-col items-center gap-4">
            <div
              className="bg-paper-100/40 border border-ink-100/60 rounded-lg p-4 w-56 h-56 flex items-center justify-center"
              aria-hidden={!svgMarkup}
            >
              {svgMarkup ? (
                <div
                  className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                  // qrcode devuelve un SVG sanitizado — sin user input
                  // directo (solo nuestra URL construida). Render directo
                  // del markup es seguro acá.
                  dangerouslySetInnerHTML={{ __html: svgMarkup }}
                />
              ) : error ? (
                <p className="text-xs text-red-700 text-center leading-snug px-2">
                  {error}
                </p>
              ) : (
                <p className="text-caption text-ink-300 italic">generando…</p>
              )}
            </div>

            <p className="text-caption text-ink-400 leading-relaxed text-center max-w-xs">
              Abre la cámara del celular y apunta. Se abrirá Momentos
              listo para tomar o adjuntar una foto.
            </p>

            <div className="w-full flex items-center gap-2 px-3 py-2 bg-paper-100/60 border border-ink-100/60 rounded-md">
              <code className="flex-1 text-micro text-ink-500 font-mono truncate">
                {url}
              </code>
              <button
                onClick={handleCopy}
                className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors shrink-0"
                title="Copiar URL"
              >
                copiar
              </button>
            </div>
          </div>

          <div className="px-5 py-2 border-t border-ink-100/60 flex justify-end">
            <button
              onClick={onClose}
              className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
            >
              cerrar
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
