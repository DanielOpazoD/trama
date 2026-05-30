/**
 * AuthGate — muestra la app solo a usuarios autenticados.
 *
 * Con Clerk no configurado (sin VITE_CLERK_PUBLISHABLE_KEY), o con
 * ALLOW_LEGACY_FALLBACK activo, deja pasar sin autenticación.
 *
 * Cuando Clerk esté configurado y el usuario no esté logueado, muestra la
 * pantalla de sign-in con la identidad editorial de Trama: portada serif sobre
 * papel con luz cálida, y el widget de Clerk temado con los tokens del sistema
 * (funciona en los tres temas, porque referencia las CSS vars).
 */
import { Show, SignIn } from '@clerk/react'

/**
 * Tematización del widget de Clerk con los tokens de Trama. Usamos `var(--…)`
 * para que respete día / noche / vela sin hardcodear colores. Ocultamos el
 * header propio de Clerk ("Sign in to Trama") porque la portada editorial de
 * arriba ya cumple ese rol.
 */
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
    // La portada editorial de arriba ya saluda; evitamos el doble título.
    header: { display: 'none' },
    socialButtonsBlockButton: { borderColor: 'rgb(var(--ink-100))' },
    dividerLine: { backgroundColor: 'rgb(var(--ink-100))' },
    footer: { background: 'transparent' },
  },
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const hasClerk = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)
  if (!hasClerk) return <>{children}</>

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
            {/* Portada editorial */}
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
          </div>
        </div>
      }
    >
      {children}
    </Show>
  )
}
