import { useEffect, useState } from 'react'
import { useToast } from '../state/toast'
import { CloseIcon } from './Icons'

/**
 * Renderiza el toast actual (si lo hay) en una zona fija abajo-centro.
 *
 * Visual:
 *   - Card oscuro tipo snackbar (alto contraste sobre cualquier vista).
 *   - Barra de progreso debajo del mensaje que se vacía durante el
 *     `durationMs`, dando feedback visual de cuánto tiempo queda.
 *   - Botón de acción (opcional) a la derecha, en el accent primario.
 *   - Botón ✕ para cerrar manualmente.
 *
 * Solo se renderiza si hay un toast activo (no se monta vacío para no
 * meter ruido en el DOM).
 */
export function ToastHost() {
  const { current, dismiss } = useToast()
  const [progress, setProgress] = useState(1)

  useEffect(() => {
    if (!current) {
      setProgress(1)
      return
    }
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

  if (!current) return null

  // λ6: 'achievement' usa inline style porque depende de --accent-gold
  // (que se mueve con la hora del día gracias a δ6). Tailwind classes
  // estáticas no pueden reflejar esa dinámica. El resto sigue con tonos
  // de Tailwind para mantener consistencia con el resto del sistema.
  const isAchievement = current.tone === 'achievement'
  const toneClass =
    current.tone === 'error'
      ? 'bg-red-900 text-red-50 border-red-700/50'
      : current.tone === 'success'
        ? 'bg-emerald-900 text-emerald-50 border-emerald-700/50'
        : isAchievement
          ? 'text-paper-50' // bg + border van inline abajo
          : 'bg-ink-800 text-paper-50 border-ink-700/50'

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
      className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-up pointer-events-none"
    >
      <div
        className={`pointer-events-auto flex items-center gap-3 pl-4 pr-2 py-2.5 rounded-xl border shadow-lg shadow-ink-900/25 min-w-[260px] max-w-[480px] ${toneClass}`}
        style={achievementStyle}
      >
        <span className="text-sm leading-snug flex-1">{current.message}</span>
        {current.action && (
          <button
            onClick={async () => {
              const fn = current.action!.onAction
              dismiss()
              await fn()
            }}
            className="text-xs uppercase tracking-eyebrow font-medium px-2.5 py-1 rounded-md transition-colors hover:bg-paper-50/15"
          >
            {current.action.label}
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label="Cerrar aviso"
          title="Cerrar"
          className="p-1 rounded-md transition-colors hover:bg-paper-50/15 opacity-70 hover:opacity-100"
        >
          <CloseIcon size={12} />
        </button>
      </div>
      {/* Barra de progreso — solo si hay duración finita. */}
      {(current.durationMs ?? 5000) > 0 && (
        <div className="mt-1 mx-2 h-px bg-paper-50/0">
          <div
            className="h-px bg-paper-50/30 transition-[width] duration-[60ms] ease-linear"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}
