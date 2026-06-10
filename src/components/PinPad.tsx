import { useCallback, useEffect, useRef, useState } from 'react'
import { LockIcon } from './Icons'

/**
 * Panel numérico circular premium para ingreso de PIN.
 *
 * Funciona con mouse (clic en botones circulares) Y teclado (teclas 0-9,
 * Backspace, Enter). Un input hidden captura el foco para que el teclado
 * siempre funcione sin necesidad de hacer clic primero.
 *
 * Diseño editorial: botones circulares con tipografía Spectral serif,
 * dots de progreso en lugar de campo de texto, animaciones sutiles
 * de feedback táctil. Compatible con los tres temas (paper/night/vela).
 */

const PIN_LENGTH = 6

type PinPadProps = {
  /** Título principal (ej. "Ingresa el PIN") */
  title: string
  /** Eyebrow superior (ej. "trama protegida", "sección protegida") */
  eyebrow: string
  /** Subtítulo / descripción */
  subtitle: string
  /** PIN correcto contra el que se valida */
  correctPin: string
  /** Callback al ingresar el PIN correcto */
  onUnlock: () => void
}

export function PinPad({ title, eyebrow, subtitle, correctPin, onUnlock }: PinPadProps) {
  const [digits, setDigits] = useState<string[]>([])
  const [error, setError] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [lastPressed, setLastPressed] = useState<string | null>(null)
  const hiddenInputRef = useRef<HTMLInputElement>(null)

  // Foco automático al montar
  useEffect(() => {
    hiddenInputRef.current?.focus()
  }, [])

  const addDigit = useCallback(
    (d: string) => {
      if (error) return // Bloqueado durante animación de error
      setDigits((prev) => {
        if (prev.length >= PIN_LENGTH) return prev
        const next = [...prev, d]

        // Auto-submit cuando se llena
        if (next.length === PIN_LENGTH) {
          const attempt = next.join('')
          if (attempt === correctPin) {
            // Pequeño delay para que se vea el último dot lleno
            setTimeout(onUnlock, 200)
          } else {
            // Animación de error + limpieza
            setError(true)
            setShaking(true)
            setTimeout(() => {
              setDigits([])
              setError(false)
              setShaking(false)
              hiddenInputRef.current?.focus()
            }, 600)
          }
        }
        return next
      })
      // Feedback visual del botón presionado
      setLastPressed(d)
      setTimeout(() => setLastPressed(null), 150)
    },
    [correctPin, error, onUnlock],
  )

  const removeDigit = useCallback(() => {
    if (error) return
    setDigits((prev) => prev.slice(0, -1))
  }, [error])

  // Manejar teclado físico
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        addDigit(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        removeDigit()
      }
    },
    [addDigit, removeDigit],
  )

  const KEYS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ]

  return (
    <div
      className="flex flex-col items-center gap-6 select-none animate-fade-up"
      onClick={() => hiddenInputRef.current?.focus()}
    >
      {/* Input oculto para capturar foco de teclado */}
      <input
        ref={hiddenInputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className="sr-only"
        aria-label="PIN"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        value=""
        onChange={() => {}}
      />

      {/* Header editorial */}
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: 'var(--accent-gold-soft)',
              color: 'var(--accent-gold)',
            }}
          >
            <LockIcon size={22} />
          </div>
        </div>
        <p className="section-eyebrow-serif" style={{ color: 'var(--accent-gold)' }}>
          {eyebrow}
        </p>
        <h2 className="font-serif text-2xl text-ink-700 leading-tight">{title}</h2>
        <p className="text-caption italic text-ink-400 max-w-xs mx-auto">{subtitle}</p>
      </div>

      {/* Dots de progreso */}
      <div
        className={`flex items-center gap-3 ${shaking ? 'pin-pad-shake' : ''}`}
        role="status"
        aria-label={`${digits.length} de ${PIN_LENGTH} dígitos ingresados`}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          const filled = i < digits.length
          const isError = error && filled
          return (
            <div
              key={i}
              className="pin-pad-dot"
              data-filled={filled || undefined}
              data-error={isError || undefined}
              style={{
                animationDelay: filled ? `${i * 30}ms` : undefined,
              }}
            />
          )
        })}
      </div>

      {/* Error message */}
      {error && (
        <p
          className="text-caption text-center"
          style={{ color: 'var(--accent-clay)' }}
          role="alert"
        >
          PIN incorrecto
        </p>
      )}

      {/* Teclado numérico circular */}
      <div className="flex flex-col gap-3">
        {KEYS.map((row, ri) => (
          <div key={ri} className="flex items-center justify-center gap-3">
            {row.map((key, ki) => {
              if (key === '') {
                return <div key={ki} className="w-16 h-16" />
              }
              if (key === 'del') {
                return (
                  <button
                    key={ki}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeDigit()
                    }}
                    disabled={error || digits.length === 0}
                    className="pin-pad-key pin-pad-key--action"
                    aria-label="Borrar último dígito"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                      <line x1="18" y1="9" x2="12" y2="15" />
                      <line x1="12" y1="9" x2="18" y2="15" />
                    </svg>
                  </button>
                )
              }
              return (
                <button
                  key={ki}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    addDigit(key)
                  }}
                  disabled={error || digits.length >= PIN_LENGTH}
                  className="pin-pad-key"
                  data-pressed={lastPressed === key || undefined}
                  aria-label={key}
                >
                  <span className="pin-pad-key__label">{key}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
