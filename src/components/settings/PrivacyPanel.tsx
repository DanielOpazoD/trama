import { useState } from 'react'
import { PanelHeader } from './_shared'
import { isPinEnabled, setPinEnabled } from '../AppPinGate'

/**
 * Configuración → Privacidad.
 *
 * Por ahora un solo control: bloqueo por PIN al abrir la app. PIN
 * hardcoded en 151219 — es un mecanismo de baja seguridad para evitar
 * que alguien que toma el teléfono o la pantalla un segundo vea el
 * contenido, no auth real.
 *
 * El toggle persiste en localStorage. Al activarlo, la app se vuelve
 * a bloquear inmediatamente (limpia sessionStorage de unlock) para
 * que el usuario confirme el funcionamiento ingresando el PIN.
 */
export function PrivacyPanel() {
  const [enabled, setEnabledState] = useState<boolean>(() => isPinEnabled())

  function handleToggle(next: boolean) {
    setPinEnabled(next)
    setEnabledState(next)
    // Notificar al AppPinGate (en otro punto del árbol) que el toggle
    // cambió — el storage event no dispara en la misma tab.
    window.dispatchEvent(new Event('trama:pin-changed'))
  }

  return (
    <section>
      <PanelHeader
        title="Privacidad"
        hint="Protege la entrada a la app con un PIN. Es una capa de pantalla rápida, no auth real — el PIN está en el código del cliente y cualquiera con acceso a la fuente lo puede leer."
      />

      <div className="space-y-4 max-w-prose">
        <div className="flex items-start justify-between gap-4 p-4 card-paper">
          <div className="min-w-0">
            <p className="text-ink-700 leading-snug">
              Bloqueo por PIN al abrir
            </p>
            <p className="mt-1 text-sm text-ink-400 leading-relaxed">
              Cuando esté activado, la app pedirá un PIN cada vez que abras
              una pestaña nueva. El PIN es <span className="font-mono text-ink-600">151219</span>.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => handleToggle(!enabled)}
            className="relative inline-flex shrink-0 mt-1 h-6 w-11 rounded-full transition-colors"
            style={{
              backgroundColor: enabled
                ? 'var(--accent-primary)'
                : 'rgb(var(--ink-200))',
            }}
          >
            <span
              aria-hidden
              className="inline-block size-5 rounded-full bg-white shadow transition-transform"
              style={{
                transform: enabled ? 'translateX(22px)' : 'translateX(2px)',
                marginTop: '2px',
              }}
            />
          </button>
        </div>

        {enabled && (
          <p className="text-caption italic text-ink-400 leading-relaxed">
            Al recargar o abrir una pestaña nueva la app te pedirá el PIN.
            El desbloqueo dura mientras la pestaña esté abierta.
          </p>
        )}
      </div>
    </section>
  )
}
