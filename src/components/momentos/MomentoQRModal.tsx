import { useEffect, useState } from 'react'
import { ModalFooter, ModalShell } from '../ModalShell'

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
  // υ-a11y: focus trap + aria-modal + Escape + restaurar foco unificados en

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

  function handleCopy() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard.writeText(url).catch(() => {
      /* clipboard denied — copiar manualmente */
    })
  }

  if (!open) return null

  return (
    <ModalShell
      ariaLabel="Escanear con el celular"
      eyebrow="desde el celular"
      title="Escanear y subir foto"
      size="xs"
      // lockScroll:false preserva el comportamiento previo: el modal se abre
      // desde el composer y no bloquea el scroll de la página.
      lockScroll={false}
      onClose={onClose}
    >
      <div className="px-5 py-6 flex flex-col items-center gap-4">
        <div
          className="bg-paper-100/40 border border-ink-100/60 rounded-lg p-4 w-56 h-56 flex items-center justify-center"
          aria-hidden={!svgMarkup}
        >
          {svgMarkup ? (
            <div
              className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
              // N2 — threat model justificando dangerouslySetInnerHTML:
              //
              // Input al QR: una URL que construimos nosotros con
              // `window.location.origin + '/?view=momentos&compose=...'`.
              // El usuario NO puede meter contenido arbitrario que
              // termine en el QR — el origin viene del browser, y los
              // params son literales hardcoded acá. No hay path donde
              // un user agregue caracteres a `svgMarkup`.
              //
              // Salida del qrcode lib: SVG con `<svg>` + `<path>` puros,
              // sin scripts ni handlers (la lib no acepta opciones que
              // generen markup ejecutable). Auditado en la versión
              // pinned a `^1.5.4`.
              //
              // Si en el futuro el QR encodea contenido del user
              // (ej. un texto que pegan), hay que sanear antes de
              // generar el SVG. Por ahora: safe.
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
          ) : error ? (
            <p className="text-caption text-[color:var(--accent-clay)] text-center leading-snug px-2">
              {error}
            </p>
          ) : (
            <p className="text-caption text-ink-300 italic">generando…</p>
          )}
        </div>

        <p className="text-caption text-ink-400 leading-relaxed text-center max-w-xs">
          Abre la cámara del celular y apunta. Se abrirá Momentos listo para tomar o
          adjuntar una foto.
        </p>

        <div className="w-full flex items-center gap-2 px-3 py-2 bg-paper-100/60 border border-ink-100/60 rounded-md">
          <code className="flex-1 text-micro text-ink-500 font-mono truncate">{url}</code>
          <button
            onClick={handleCopy}
            className="section-eyebrow hover:text-ink-700 transition-colors shrink-0"
            title="Copiar URL"
          >
            copiar
          </button>
        </div>
      </div>

      <ModalFooter>
        <button
          onClick={onClose}
          className="section-eyebrow hover:text-ink-700 transition-colors"
        >
          cerrar
        </button>
      </ModalFooter>
    </ModalShell>
  )
}
