import { useEffect, useState } from 'react'
import { Spinner } from './Spinner'

/**
 * Ola transversal 2026-06: frase de espera con voz editorial para operaciones
 * largas (trazar el atlas, OCR, ensamblados). En vez del "Cargando…" genérico,
 * la app habla con su registro: «trazando el cielo…», «leyendo la tinta…».
 *
 * - Rota entre las frases cada `intervalMs` con un fundido corto.
 * - `prefers-reduced-motion`: sin rotación ni fundido — la primera frase,
 *   quieta (la espera no necesita más movimiento del que pide el usuario).
 * - Es texto de estado: el caller decide el contenedor (role="status" si
 *   corresponde); acá solo la voz.
 */
export function WaitingVoice({
  phrases,
  intervalMs = 2800,
  className = '',
}: {
  /** Frases en minúscula con puntos suspensivos, estilo de la casa. */
  phrases: string[]
  intervalMs?: number
  className?: string
}) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (phrases.length <= 1) return
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    const tick = window.setInterval(() => {
      // Fundido de salida breve, luego la siguiente frase entra ya visible.
      setVisible(false)
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % phrases.length)
        setVisible(true)
      }, 220)
    }, intervalMs)
    return () => window.clearInterval(tick)
  }, [phrases.length, intervalMs])

  const phrase = phrases[index % Math.max(phrases.length, 1)] ?? ''
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-serif italic text-ink-400 transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      } ${className}`}
    >
      <Spinner size={14} variant="ai" decorative />
      <span>{phrase}</span>
    </span>
  )
}
