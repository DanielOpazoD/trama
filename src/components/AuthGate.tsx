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

/** Banner discreto que recuerda que se está en modo prueba + salida. */
function DemoBanner() {
  return (
    <div
      // En mobile vive ABAJO, por encima de la barra de captura (con top-14
      // tapaba la fila de tabs); en desktop pegado al borde inferior. El
      // margen suma el inset del home indicator en iPhones con notch.
      className="fixed left-3 bottom-28 md:bottom-3 z-50 flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-paper-50/95 backdrop-blur border border-ink-100 shadow-lg shadow-ink-900/10"
      style={{ marginBottom: 'var(--safe-bottom)' }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: 'var(--accent-gold)' }}
        aria-hidden
      />
      <span className="text-micro uppercase tracking-eyebrow text-ink-500">
        modo prueba
      </span>
      <span className="text-micro text-ink-300 hidden sm:inline">
        · datos solo en este navegador
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

  const hasClerk =
    Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) &&
    import.meta.env.VITE_TRAMA_E2E_BYPASS_CLERK !== '1'
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
            <header className="text-center mb-8">
              <p
                className="section-eyebrow-serif mb-1.5"
                style={{ color: 'var(--accent-gold)' }}
              >
                tu catálogo personal
              </p>
              <h1 className="font-serif text-5xl text-ink-700 tracking-tight leading-none">
                Trama
              </h1>
              <span className="accent-rule mx-auto mt-4" />
              <p className="mt-5 text-sm text-ink-400 leading-relaxed max-w-[17rem] mx-auto">
                Un mapa de tus lecturas, citas y afinidades. Entra para retomar el hilo.
              </p>
            </header>
            <SignIn routing="hash" appearance={clerkAppearance} />
            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  enterDemoMode()
                  window.location.reload()
                }}
                className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
              >
                explorar en modo prueba
              </button>
              <p className="mt-1.5 text-micro text-ink-300/80">
                sin cuenta · datos solo en este navegador
              </p>
            </div>
          </div>
        </div>
      }
    >
      {children}
    </Show>
  )
}
