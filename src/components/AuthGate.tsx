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
import { Show, SignIn, SignUp } from '@clerk/react'
import { useEffect, useState } from 'react'
import { enterDemoMode, exitDemoMode, isDemoMode } from '../lib/demo'
import { shouldUseClerk } from '../lib/clerkRuntime'
import { EyeIcon, TramaMark } from './Icons'
import { LoginThreadField } from './LoginThreadField'
import { TramaMascot } from './TramaMascot'
import './AuthGate.css'

const clerkAppearance = {
  variables: {
    colorPrimary: 'var(--accent-primary)',
    colorText: 'rgb(var(--ink-700))',
    colorTextSecondary: 'rgb(var(--ink-300))',
    colorBackground: 'rgb(var(--paper-50) / 0.72)',
    colorInputBackground: 'rgb(var(--paper-50) / 0.72)',
    colorInputText: 'rgb(var(--ink-700))',
    borderRadius: '0.625rem',
    fontFamily: 'inherit',
  },
  elements: {
    rootBox: { width: '100%' },
    card: {
      boxShadow: 'none',
      border: '1px solid rgb(var(--ink-100) / 0.56)',
      backgroundColor: 'rgb(var(--paper-50) / 0.6)',
      backdropFilter: 'blur(22px) saturate(1.08)',
    },
    header: { display: 'none' },
    socialButtonsBlockButton: {
      borderColor: 'rgb(var(--ink-100) / 0.66)',
      backgroundColor: 'rgb(var(--paper-50) / 0.52)',
      boxShadow:
        '0 1px 0 rgb(var(--paper-50) / 0.8) inset, 0 10px 24px rgb(var(--ink-900) / 0.035)',
    },
    dividerLine: { backgroundColor: 'rgb(var(--ink-100) / 0.72)' },
    footer: {
      background: 'transparent',
      borderTop: '1px solid rgb(var(--ink-100) / 0.32)',
      boxShadow: 'none',
      color: 'rgb(var(--ink-300))',
      paddingTop: '1rem',
    },
    footerAction: {
      color: 'rgb(var(--ink-300))',
      fontSize: '0.78rem',
    },
    footerActionText: {
      color: 'rgb(var(--ink-300))',
    },
    footerActionLink: {
      color: 'rgb(var(--ink-600))',
      fontWeight: '500',
      textDecoration: 'none',
    },
    footerItem: {
      opacity: '0.48',
      filter: 'saturate(0.68)',
    },
    footerItemText: {
      color: 'rgb(var(--ink-300))',
      fontSize: '0.76rem',
      letterSpacing: '0',
    },
  },
}

type AuthScreenMode = 'sign-in' | 'sign-up'

function readAuthScreenMode(): AuthScreenMode {
  if (typeof window === 'undefined') return 'sign-in'
  return window.location.hash.includes('sign-up') ? 'sign-up' : 'sign-in'
}

function useAuthScreenMode() {
  const [mode, setMode] = useState<AuthScreenMode>(() => readAuthScreenMode())

  useEffect(() => {
    const updateMode = () => setMode(readAuthScreenMode())
    window.addEventListener('hashchange', updateMode)
    return () => window.removeEventListener('hashchange', updateMode)
  }, [])

  return mode
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

function AuthScreen() {
  const mode = useAuthScreenMode()

  return (
    <div className="trama-login-shell">
      <LoginThreadField />
      <div className="trama-login-content">
        <header className="trama-login-brand">
          <svg
            aria-hidden="true"
            className="trama-login-brandTrace"
            fill="none"
            viewBox="0 0 420 130"
          >
            <path
              d="M18 75C72 22 112 111 164 64C214 20 246 104 303 58C340 28 370 39 402 23"
              pathLength="1"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.1"
            />
            <path
              d="M78 104C134 74 182 94 229 82C279 70 324 104 374 77"
              pathLength="1"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="0.8"
            />
          </svg>
          <div className="trama-login-titleRow">
            <div className="trama-login-lockup" aria-label="Trama">
              <span data-testid="login-brand-mark">
                <TramaMark size={104} className="trama-login-mark" />
              </span>
              <h1
                className="trama-login-wordmark text-ink-700"
                data-testid="login-brand-wordmark"
              >
                TRAMA
              </h1>
            </div>
            <span className="trama-login-mascotSeal" data-testid="login-mascot-seal">
              <TramaMascot
                className="trama-mascot--wordmark trama-mascot--loginAwake"
                tabIndex={0}
              />
            </span>
          </div>
          <p className="trama-login-subtitle text-micro uppercase tracking-eyebrow">
            tu archivo vivo
          </p>
        </header>
        <div className="trama-login-panel">
          {mode === 'sign-up' ? (
            <SignUp routing="hash" signInUrl="/#sign-in" appearance={clerkAppearance} />
          ) : (
            <SignIn routing="hash" signUpUrl="/#sign-up" appearance={clerkAppearance} />
          )}
        </div>
        <div className="trama-login-demoAction flex justify-center">
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
    <Show when="signed-in" fallback={<AuthScreen />}>
      {children}
    </Show>
  )
}
