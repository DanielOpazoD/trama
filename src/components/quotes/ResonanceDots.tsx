import { useState } from 'react'

/**
 * U-1: Resonancia — 5 puntos discretos para marcar "cuánto resuena esta
 * cita hoy" en escala 1-5. NO es rating de calidad: es **registro de uno
 * mismo en el tiempo**. Una cita que resonaba 5 en mayo puede caer a 2
 * en agosto — esa derivada es el insight, no el valor absoluto.
 *
 * Visual:
 *   - 5 puntos pequeños (4px) en línea, gap-1.5
 *   - Llenos hasta el valor actual con `--accent-gold`, vacíos con
 *     border `--ink-200`. No color rainbow — todos los niveles son
 *     del mismo accent.
 *   - Hover sobre un punto previsualiza esa selección (efímero)
 *   - Click en el punto N → setea resonance=N. Click en el punto que
 *     ya está activo → unset (vuelve a null).
 *   - Eyebrow opcional "resuena hoy" en micro tracking-eyebrow ink-400
 *     a la izquierda
 *
 * El componente es controlado: el padre maneja el valor y el callback.
 */
export function ResonanceDots({
  value,
  onChange,
  disabled = false,
  showLabel = true,
}: {
  /** 1-5, o undefined si no está marcada. */
  value: number | undefined
  /** Callback con el nuevo valor (1-5) o null (destildar). */
  onChange: (next: number | null) => void
  disabled?: boolean
  showLabel?: boolean
}) {
  // Hover preview — al pasar sobre un dot, mostramos cómo quedaría sin
  // commitear el cambio. Se borra al salir o al hacer click.
  const [hovered, setHovered] = useState<number | null>(null)
  const display = hovered ?? value ?? 0

  function handleClick(n: number) {
    if (disabled) return
    // Click en el dot activo desmarca; click en otro lo setea.
    onChange(value === n ? null : n)
    setHovered(null)
  }

  return (
    <div className="inline-flex items-center gap-2">
      {showLabel && <span className="section-eyebrow select-none">resuena hoy</span>}
      <div
        className="inline-flex items-center gap-1.5"
        role="radiogroup"
        aria-label="Resonancia de esta cita hoy, en escala de 1 a 5"
        onMouseLeave={() => setHovered(null)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= display
          // Cuando hay hover, el preview se ve más "tentativo" (opacity).
          const previewing = hovered !== null && hovered !== (value ?? 0)
          return (
            <button
              key={n}
              type="button"
              onClick={() => handleClick(n)}
              onMouseEnter={() => !disabled && setHovered(n)}
              onFocus={() => !disabled && setHovered(n)}
              onBlur={() => setHovered(null)}
              disabled={disabled}
              role="radio"
              aria-checked={value === n}
              aria-label={`Resonancia ${n} de 5${value === n ? ' (marcado)' : ''}`}
              className="w-2 h-2 rounded-full transition-all duration-150 disabled:cursor-not-allowed"
              style={{
                backgroundColor: filled ? 'var(--accent-gold)' : 'transparent',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: filled ? 'var(--accent-gold)' : 'rgb(var(--ink-200))',
                opacity: previewing ? 0.7 : 1,
                // Cursor pointer solo si vamos a hacer algo distinto a
                // lo que ya está.
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
