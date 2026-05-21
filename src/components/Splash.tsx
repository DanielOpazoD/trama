import { useEffect, useState } from 'react'

/**
 * First-render splash: a Trama monogram weaves itself in, then fades.
 * Only shown once per session (sessionStorage) to avoid annoying repeat
 * viewers — first impression matters, second visit shouldn't.
 */
export function Splash() {
  const [shown, setShown] = useState(() => {
    if (typeof window === 'undefined') return false
    return !window.sessionStorage.getItem('trama:splash-seen')
  })

  useEffect(() => {
    if (!shown) return
    const t = window.setTimeout(() => {
      setShown(false)
      try {
        window.sessionStorage.setItem('trama:splash-seen', '1')
      } catch {
        /* sessionStorage may be disabled */
      }
    }, 1900)
    return () => window.clearTimeout(t)
  }, [shown])

  if (!shown) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-splash-out"
      style={{ backgroundColor: 'rgb(var(--paper-50))' }}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-5">
        <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
          <path
            className="mark-crossbar"
            d="M5 6h14"
            stroke="rgb(var(--ink-700))"
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <path
            className="mark-vertical"
            d="M12 6v13"
            stroke="rgb(var(--ink-700))"
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <path
            className="mark-thread"
            d="M9 11l6 4M15 11l-6 4"
            stroke="rgb(var(--ink-700))"
            strokeWidth={1.2}
            strokeLinecap="round"
          />
        </svg>
        <p className="wordmark text-3xl text-ink-700 mark-thread leading-none">Trama</p>
      </div>
    </div>
  )
}
