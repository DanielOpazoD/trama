import { useEffect, useState } from 'react'
import { PinPad } from './PinPad'

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
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgb(var(--paper-50))' }}
    >
      <PinPad
        eyebrow="trama protegida"
        title="Ingresa el PIN"
        subtitle="Esta trama está bloqueada. Confirma con tu clave para entrar."
        correctPin={PIN}
        onUnlock={onUnlock}
      />
    </div>
  )
}
