import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalOverlay } from '../../hooks/useModalOverlay'
import {
  generateLaminaBlob,
  generateLaminaPreview,
  laminaFilename,
  type LaminaInput,
  type LaminaTheme,
} from '../../lib/lamina'
import { downloadBlob } from '../../lib/downloadBlob'
import { useToast } from '../../state/toast'
import { CloseIcon } from '../Icons'

/**
 * Modal de la Lámina: vista previa real (el mismo canvas que se exporta),
 * fondo elegible entre los tres temas de la casa, marginalia opcional y
 * dos salidas: descargar PNG o compartir (Web Share API con archivos,
 * donde el browser lo soporte — si no, el botón no aparece).
 */

const THEME_OPTIONS: { id: LaminaTheme; label: string; swatch: string }[] = [
  { id: 'paper', label: 'Papel', swatch: '#ffffff' },
  { id: 'night', label: 'Noche', swatch: '#09090b' },
  { id: 'vela', label: 'Vela', swatch: '#1a140e' },
]

export function LaminaModal({
  input,
  onClose,
}: {
  input: LaminaInput
  onClose: () => void
}) {
  const toast = useToast()
  const [theme, setTheme] = useState<LaminaTheme>('paper')
  const [withMarginalia, setWithMarginalia] = useState(Boolean(input.marginalia))
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const effectiveInput: LaminaInput = {
    ...input,
    marginalia: withMarginalia ? input.marginalia : null,
  }

  useEffect(() => {
    let cancelled = false
    generateLaminaPreview(effectiveInput, theme)
      .then((url) => {
        if (!cancelled) setPreview(url)
      })
      .catch(() => {
        if (!cancelled) setPreview(null)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, withMarginalia, input.text])

  // Escape + focus trap + scroll-lock + restaurar foco al trigger, vía el
  // primitivo canónico. Reemplaza el listener manual de keydown en window.
  // Escape cierra siempre (igual que antes): generar/compartir no bloqueaba
  // el cierre — solo deshabilita los botones de acción del footer.
  const overlay = useModalOverlay({ open: true, onClose })

  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'

  async function handleDownload() {
    setBusy(true)
    try {
      const blob = await generateLaminaBlob(effectiveInput, theme)
      downloadBlob(blob, laminaFilename(input.attribution))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo generar la lámina'
      toast.show({ message: msg, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleShare() {
    setBusy(true)
    try {
      const blob = await generateLaminaBlob(effectiveInput, theme)
      const file = new File([blob], laminaFilename(input.attribution), {
        type: 'image/png',
      })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] })
      } else {
        downloadBlob(blob, laminaFilename(input.attribution))
      }
    } catch (err) {
      // AbortError = el usuario cerró la hoja de compartir; silencio.
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.show({ message: 'No se pudo compartir la lámina', tone: 'error' })
      }
    } finally {
      setBusy(false)
    }
  }

  const content = (
    <>
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="fixed inset-0 z-40 bg-ink-900/30 backdrop-blur-sm cursor-default"
        tabIndex={-1}
      />
      <div
        ref={overlay.dialogRef}
        role="dialog"
        aria-label="Lámina"
        aria-modal="true"
        className="fixed inset-x-4 top-10 bottom-10 z-50 flex flex-col overflow-hidden rounded-xl border border-ink-100/50 bg-paper-50/95 shadow-lg shadow-ink-900/10 backdrop-blur-md md:left-1/2 md:right-auto md:w-[520px] md:-ml-[260px]"
      >
        <header className="px-5 py-3.5 border-b border-ink-100/60 flex items-baseline justify-between gap-3">
          <div>
            <p className="text-micro uppercase tracking-eyebrow text-ink-300">lámina</p>
            <h2 className="font-serif text-lg text-ink-700 mt-0.5">
              La cita como objeto
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors shrink-0"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Vista previa — exactamente lo que se exporta. */}
          <div className="mx-auto max-w-[320px] rounded-md border border-ink-100 shadow-sm shadow-ink-900/10 overflow-hidden">
            {preview ? (
              <img
                src={preview}
                alt="Vista previa de la lámina"
                className="block w-full"
              />
            ) : (
              <div className="aspect-[4/5] flex items-center justify-center text-caption text-ink-300 font-serif italic">
                componiendo…
              </div>
            )}
          </div>

          <div
            className="flex items-center justify-center gap-2"
            role="radiogroup"
            aria-label="Fondo"
          >
            {THEME_OPTIONS.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={theme === t.id}
                onClick={() => setTheme(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-caption transition-colors ${
                  theme === t.id
                    ? 'border-ink-400 text-ink-800'
                    : 'border-ink-100 text-ink-400 hover:border-ink-200 hover:text-ink-700'
                }`}
              >
                <span
                  aria-hidden
                  className="size-3 rounded-full border border-ink-200"
                  style={{ backgroundColor: t.swatch }}
                />
                {t.label}
              </button>
            ))}
          </div>

          {input.marginalia && (
            <label className="flex items-center justify-center gap-2 text-caption text-ink-500">
              <input
                type="checkbox"
                checked={withMarginalia}
                onChange={(e) => setWithMarginalia(e.target.checked)}
                className="accent-[var(--accent-primary)]"
                aria-label="Incluir tu reflexión manuscrita"
              />
              incluir tu reflexión manuscrita
            </label>
          )}
        </div>

        <footer className="px-5 py-3.5 border-t border-ink-100/60 flex items-center justify-end gap-3">
          {canShareFiles && (
            <button
              onClick={handleShare}
              disabled={busy}
              className="text-xs uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors disabled:opacity-40"
            >
              compartir
            </button>
          )}
          <button onClick={handleDownload} disabled={busy} className="btn-accent text-xs">
            {busy ? 'generando…' : 'descargar PNG'}
          </button>
        </footer>
      </div>
    </>
  )

  return createPortal(content, document.body)
}
