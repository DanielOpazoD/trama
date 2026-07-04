import { useEffect, useState } from 'react'
import { useToast } from '../state/toast'
import { CloseButton } from './CloseButton'

// Debe coincidir con la duración de `.animate-toast-out` en index.css.
const TOAST_LEAVE_MS = 200

/**
 * Renderiza el toast actual (si lo hay) en una zona fija abajo-centro.
 *
 * Visual:
 *   - Card oscuro tipo snackbar (alto contraste sobre cualquier vista).
 *   - Barra de progreso debajo del mensaje que se vacía durante el
 *     `durationMs`, dando feedback visual de cuánto tiempo queda.
 *   - Botón de acción (opcional) a la derecha, en el accent primario.
 *   - Botón ✕ para cerrar manualmente.
 *   - Entra y SALE con movimiento: cuando el store cierra el toast, lo
 *     mantenemos montado ~200ms para animar la salida en vez de que
 *     desaparezca en seco.
 *
 * El centrado (`-translate-x-1/2`) vive en el contenedor de posición y la
 * animación (opacity + translateY) en un hijo aparte: así el movimiento
 * nunca pisa el translateX que centra el toast.
 */
export function ToastHost() {
  const { current, dismiss } = useToast()
  // `shown` sigue vivo durante la salida aunque el store ya sea null.
  const [shown, setShown] = useState(current)
  const [leaving, setLeaving] = useState(false)
  const [progress, setProgress] = useState(1)

  // Sincroniza el toast visible con el store, animando la salida.
  useEffect(() => {
    if (current) {
      setShown(current)
      setLeaving(false)
      return
    }
    // El store se vació: si había algo en pantalla, anímalo hacia afuera
    // antes de desmontarlo.
    setLeaving(true)
    const t = window.setTimeout(() => setShown(null), TOAST_LEAVE_MS)
    return () => window.clearTimeout(t)
  }, [current])

  // Barra de progreso: corre mientras el toast está activo (no en salida).
  useEffect(() => {
    if (!current) return
    const duration = current.durationMs ?? 5000
    if (duration <= 0) {
      setProgress(1)
      return
    }
    // Animación lineal: actualizamos cada 60ms para no machacar el render.
    // Calculamos progresión real contra wall-clock para que no derive.
    const startedAt = Date.now()
    setProgress(1)
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      const pct = Math.max(0, 1 - elapsed / duration)
      setProgress(pct)
      if (pct <= 0) window.clearInterval(interval)
    }, 60)
    return () => window.clearInterval(interval)
  }, [current])

  if (!shown) return null

  // λ6: 'achievement' usa inline style porque depende de --accent-gold
  // (que se mueve con la hora del día gracias a δ6). El resto usa clases
  // semánticas para que el color viva con los tokens visuales, no en JSX.
  const isAchievement = shown.tone === 'achievement'
  const toneClass =
    shown.tone === 'error'
      ? 'toast-error'
      : shown.tone === 'success'
        ? 'toast-success'
        : isAchievement
          ? 'toast-achievement' // bg + border van inline abajo
          : 'toast-default'

  const achievementStyle: React.CSSProperties | undefined = isAchievement
    ? {
        // Capa oscura ink-800 para legibilidad del texto blanco, con un
        // wash gold-soft encima que da el matiz cálido. El border es
        // del gold pleno con opacidad alta — la "guardia editorial" de
        // que esto es un momento de celebración, no un guardado normal.
        backgroundColor: 'rgb(var(--ink-800))',
        backgroundImage:
          'linear-gradient(180deg, var(--accent-gold-soft) 0%, var(--accent-gold-soft) 100%)',
        borderColor: 'var(--accent-gold)',
      }
    : undefined

  return (
    <div
      role="status"
      aria-live="polite"
      // bottom-20 en mobile para no quedar tapado por la MobileBottomNav
      // (que vive en flex-col root). Desktop mantiene bottom-6 estándar.
      className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
    >
      <div className={leaving ? 'animate-toast-out' : 'animate-toast-in'}>
        <div className={`toast-surface ${toneClass}`} style={achievementStyle}>
          <span className="text-body leading-snug flex-1">{shown.message}</span>
          {shown.action && (
            <button
              onClick={async () => {
                const fn = shown.action!.onAction
                dismiss()
                await fn()
              }}
              className="text-xs uppercase tracking-eyebrow font-medium px-2.5 py-1 rounded-md transition-colors hover:bg-paper-50/15"
            >
              {shown.action.label}
            </button>
          )}
          <CloseButton
            onClick={dismiss}
            label="Cerrar aviso"
            title="Cerrar"
            size={12}
            className="p-1 rounded-md transition-colors hover:bg-paper-50/15 opacity-70 hover:opacity-100"
          />
        </div>
        {/* Barra de progreso — solo si hay duración finita. */}
        {(shown.durationMs ?? 5000) > 0 && (
          <div className="mt-1 mx-2 h-px bg-paper-50/0">
            <div
              className="h-px bg-paper-50/30 transition-[width] duration-[60ms] ease-linear"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
