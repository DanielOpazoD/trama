import { useEffect, useState } from 'react'
import { OrnamentBreak } from './Icons'
import { readHiloOfTheDay } from '../hooks/useHiloOfTheDay'

/**
 * First-render splash. Identidad editorial desde el primer pixel:
 *   - eyebrow uppercase pequeño (categoría del producto)
 *   - monograma woven Trama animado (thread-in)
 *   - wordmark Spectral
 *   - ornament editorial
 *   - aforismo en serif italic — rotado por sesión para que cada
 *     visita se sienta distinta
 *
 * Solo se muestra una vez por sesión (sessionStorage). Primera
 * impresión importa; segunda visita no.
 */
const APHORISMS = [
  'hilo a hilo',
  'lo que retuviste',
  'una conexión a la vez',
  'el mapa de lo que leíste',
  'lo que te llegó',
  'tu trama personal',
]

function pickAphorism(): string {
  // δ7: si HomeView cacheó un "hilo del día" (aniversario detectado
  // en la data del usuario), preferimos esa frase personalizada. Si no
  // hay hilo para hoy, caemos al aforismo random — comportamiento
  // original. La cache se actualiza una vez por día desde HomeView.
  const hilo = readHiloOfTheDay()
  if (hilo) return hilo
  return APHORISMS[Math.floor(Math.random() * APHORISMS.length)]
}

export function Splash() {
  const [shown, setShown] = useState(() => {
    if (typeof window === 'undefined') return false
    return !window.sessionStorage.getItem('trama:splash-seen')
  })
  const [aphorism] = useState(pickAphorism)

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
      <div className="flex flex-col items-center gap-4">
        <p className="text-micro uppercase tracking-shout text-ink-300 mark-thread">
          mapa cognitivo personal
        </p>

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

        <p className="wordmark text-3xl text-ink-700 mark-thread leading-none">
          Trama
        </p>

        <div className="mark-thread text-ink-200">
          <OrnamentBreak size={56} />
        </div>

        <p className="mark-thread font-serif italic text-sm text-ink-400 leading-snug">
          {aphorism}
        </p>
      </div>
    </div>
  )
}
