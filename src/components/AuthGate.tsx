/**
 * AuthGate — muestra la app solo a usuarios autenticados.
 *
 * Tres caminos:
 *   1. Modo prueba activo → entra directo con el banner "modo prueba" (los
 *      datos viven en localStorage, no en una cuenta). Sirve para recorrer y
 *      probar la app sin login.
 *   2. Clerk no configurado (sin VITE_CLERK_PUBLISHABLE_KEY) → pasa sin login.
 *   3. Clerk configurado → pantalla de inicio de sesión editorial, con la
 *      opción de "explorar en modo prueba".
 *
 * El widget de Clerk se tema con los tokens del sistema (CSS vars) para que
 * respete día / noche / vela sin hardcodear colores.
 */
import { Show, SignIn } from '@clerk/react'
import { enterDemoMode, exitDemoMode, isDemoMode } from '../lib/demo'
import { shouldUseClerk } from '../lib/clerkRuntime'
import { EyeIcon } from './Icons'

const clerkAppearance = {
  variables: {
    colorPrimary: 'var(--accent-primary)',
    colorText: 'rgb(var(--ink-700))',
    colorTextSecondary: 'rgb(var(--ink-300))',
    colorBackground: 'rgb(var(--paper-50))',
    colorInputBackground: 'rgb(var(--paper-50))',
    colorInputText: 'rgb(var(--ink-700))',
    borderRadius: '0.625rem',
    fontFamily: 'inherit',
  },
  elements: {
    rootBox: { width: '100%' },
    card: {
      boxShadow: 'var(--card-shadow)',
      border: '1px solid rgb(var(--ink-100))',
      backgroundColor: 'rgb(var(--paper-50))',
    },
    header: { display: 'none' },
    socialButtonsBlockButton: { borderColor: 'rgb(var(--ink-100))' },
    dividerLine: { backgroundColor: 'rgb(var(--ink-100))' },
    footer: { background: 'transparent' },
  },
}

/** Banner discreto que recuerda que se está en modo prueba + salida. El
 *  detalle ("datos solo en este navegador") vive en el tooltip para que el
 *  píldora quede a un icono sutil + texto brevísimo. */
function DemoBanner() {
  return (
    <div
      // En mobile vive ABAJO, por encima de la barra de captura (con top-14
      // tapaba la fila de tabs); en desktop pegado al borde inferior. El
      // margen suma el inset del home indicator en iPhones con notch.
      className="fixed left-3 bottom-28 md:bottom-3 z-50 flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-paper-50/95 backdrop-blur border border-ink-100 shadow-lg shadow-ink-900/10"
      style={{ marginBottom: 'var(--safe-bottom)' }}
      title="Modo prueba · los datos viven solo en este navegador"
    >
      <EyeIcon size={12} className="text-ink-400 shrink-0" />
      <span className="text-micro uppercase tracking-eyebrow text-ink-500">
        modo prueba
      </span>
      <button
        onClick={() => {
          exitDemoMode()
          window.location.reload()
        }}
        className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
      >
        salir
      </button>
    </div>
  )
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  // (1) Modo prueba: entra directo, sin Clerk, con banner.
  if (isDemoMode()) {
    return (
      <>
        {children}
        <DemoBanner />
      </>
    )
  }

  const hasClerk = shouldUseClerk({
    e2eBypass: import.meta.env.VITE_TRAMA_E2E_BYPASS_CLERK,
    publishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  })
  // (2) Sin Clerk configurado.
  if (!hasClerk) return <>{children}</>

  // (3) Pantalla de inicio de sesión editorial.
  return (
    <Show
      when="signed-in"
      fallback={
        <div
          className="min-h-screen flex items-center justify-center px-6 py-12"
          style={{
            background:
              'radial-gradient(ellipse 90% 55% at 50% -10%, var(--accent-gold-soft), transparent 70%), rgb(var(--paper-100))',
          }}
        >
          <div className="w-full max-w-sm animate-fade-up">
            <header className="text-center mb-9">
              <h1 className="font-serif text-6xl text-ink-700 tracking-tight leading-none">
                Trama
              </h1>
              <p className="mt-4 text-micro uppercase tracking-eyebrow text-ink-400">
                tu catálogo personal
              </p>
            </header>
            <SignIn routing="hash" appearance={clerkAppearance} />
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => {
                  enterDemoMode()
                  window.location.reload()
                }}
                title="Sin cuenta · los datos viven solo en este navegador"
                className="group inline-flex items-center gap-1.5 text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-600 transition-colors"
              >
                <EyeIcon
                  size={12}
                  className="opacity-70 transition-opacity group-hover:opacity-100"
                />
                explorar sin cuenta
              </button>
            </div>
          </div>
        </div>
      }
    >
      {children}
    </Show>
  )
}
