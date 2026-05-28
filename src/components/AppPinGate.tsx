import { useEffect, useRef, useState } from 'react'

/**
 * Bloqueo por PIN para TODA la app. Opcional — se controla con un
 * toggle en Configuración → Privacidad (localStorage).
 *
 * Mecanismo transitorio de baja seguridad — el PIN está hardcoded en el
 * bundle, así que cualquiera con acceso al código fuente lo puede leer.
 * Sirve para que alguien que toma el teléfono o la pantalla un segundo
 * no vea el contenido, no como auth real.
 *
 * Persistencia:
 *   - `trama:pin-enabled` (localStorage) → preferencia del usuario.
 *     '1' = bloquear al abrir; ausente/otro = no bloquear.
 *   - `trama:pin-unlocked` (sessionStorage) → sesión actual desbloqueada.
 *     Se borra al cerrar la pestaña.
 */
const PIN = '151219'
const ENABLED_KEY = 'trama:pin-enabled'
const UNLOCKED_KEY = 'trama:pin-unlocked'

export function isPinEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

export function setPinEnabled(enabled: boolean) {
  try {
    if (enabled) {
      window.localStorage.setItem(ENABLED_KEY, '1')
      // Al activar, limpiamos el unlock — la próxima vista pedirá PIN.
      window.sessionStorage.removeItem(UNLOCKED_KEY)
    } else {
      window.localStorage.removeItem(ENABLED_KEY)
    }
  } catch {
    /* storage no disponible */
  }
}

function isUnlocked(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(UNLOCKED_KEY) === '1'
  } catch {
    return false
  }
}

function persistUnlocked() {
  try {
    window.sessionStorage.setItem(UNLOCKED_KEY, '1')
  } catch {
    /* sessionStorage no disponible — el unlock dura solo este render */
  }
}

export function AppPinGate({ children }: { children: React.ReactNode }) {
  // Estado reactivo: el toggle de Settings puede activar el PIN en vivo;
  // el efecto de abajo escucha el cambio y vuelve a bloquear.
  const [enabled, setEnabled] = useState<boolean>(() => isPinEnabled())
  const [unlocked, setUnlocked] = useState<boolean>(() => isUnlocked())

  // Escuchar cambios al toggle desde Settings. Settings modifica
  // localStorage directamente; el storage event no dispara para la
  // misma tab, así que usamos un custom event 'trama:pin-changed'.
  useEffect(() => {
    function onChange() {
      setEnabled(isPinEnabled())
      setUnlocked(isUnlocked())
    }
    window.addEventListener('trama:pin-changed', onChange)
    return () => window.removeEventListener('trama:pin-changed', onChange)
  }, [])

  // Si el PIN no está habilitado, no bloqueamos nada.
  if (!enabled) return <>{children}</>
  // Si ya está desbloqueado en esta sesión, mostrar la app.
  if (unlocked) return <>{children}</>
  // Si está habilitado pero no unlocked → pantalla de PIN.
  return (
    <PinScreen
      onUnlock={() => {
        persistUnlocked()
        setUnlocked(true)
      }}
    />
  )
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
    <div
      className="min-h-screen flex items-center justify-center px-4 animate-fade-up"
      style={{ backgroundColor: 'rgb(var(--paper-50))' }}
    >
      <form
        onSubmit={handleSubmit}
        className="card-paper-soft w-full max-w-sm p-7 space-y-5"
      >
        <div className="text-center space-y-2">
          <p className="section-eyebrow-serif" style={{ color: 'var(--accent-gold)' }}>
            trama protegida
          </p>
          <h2 className="font-serif text-3xl text-ink-700 leading-tight">
            Ingresa el PIN
          </h2>
          <p className="text-caption italic text-ink-400 max-w-xs mx-auto">
            Esta trama está bloqueada. Confirma con tu clave para entrar.
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
          className="btn-accent w-full text-xs"
        >
          desbloquear
        </button>
      </form>
    </div>
  )
}
