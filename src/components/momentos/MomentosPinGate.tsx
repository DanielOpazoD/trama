import { useEffect, useRef, useState } from 'react'

/**
 * Bloqueo por PIN para la sección Momentos.
 *
 * Mecanismo transitorio de baja seguridad — el PIN está hardcoded en el
 * bundle del cliente, así que cualquiera con acceso al código fuente lo
 * puede leer. Sirve para evitar que alguien que tome el teléfono o la
 * pantalla un segundo vea el contenido, no como mecanismo real de
 * autenticación.
 *
 * Persistencia: sessionStorage. La sesión queda desbloqueada hasta que
 * el usuario cierre la pestaña. Reload por sí solo NO bloquea de nuevo
 * (sessionStorage sobrevive a F5 dentro de la misma pestaña), pero sí
 * lo hace al cerrar la pestaña o abrir una nueva.
 */
const PIN = '151219'
const STORAGE_KEY = 'momentos-pin-ok'

function isUnlocked(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function persistUnlocked() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* sessionStorage no disponible (modo incógnito raro) — ignorar.
       El gate sigue funcionando para la sesión actual via state. */
  }
}

export function MomentosPinGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean>(() => isUnlocked())

  if (unlocked) return <>{children}</>
  return <PinScreen onUnlock={() => {
    persistUnlocked()
    setUnlocked(true)
  }} />
}

function PinScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pin === PIN) {
      setError(null)
      onUnlock()
      return
    }
    setError('PIN incorrecto')
    setPin('')
    inputRef.current?.focus()
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 animate-fade-up">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm p-6 bg-paper-100/60 border border-ink-100/60 rounded-xl space-y-4"
      >
        <div className="text-center space-y-1">
          <p
            className="section-eyebrow-serif"
            style={{ color: 'var(--accent-gold)' }}
          >
            sección protegida
          </p>
          <h2 className="font-serif text-2xl text-ink-700 leading-tight">
            Ingresa el PIN
          </h2>
          <p className="text-caption italic text-ink-400">
            Los momentos son privados — confirma con tu clave para verlos.
          </p>
        </div>
        <div className="space-y-1">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value)
              if (error) setError(null)
            }}
            placeholder="••••••"
            className="input-paper w-full text-center text-lg tracking-widest tabular-nums"
            aria-label="PIN"
            aria-invalid={error ? 'true' : undefined}
          />
          {error && (
            <p className="text-caption text-red-700 text-center" role="alert">
              {error}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={pin.length === 0}
          className="btn-ink w-full text-xs"
        >
          desbloquear
        </button>
      </form>
    </div>
  )
}
