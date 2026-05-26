/**
 * AuthGate — muestra la app solo a usuarios autenticados.
 *
 * Con Clerk no configurado (sin VITE_CLERK_PUBLISHABLE_KEY), o con
 * ALLOW_LEGACY_FALLBACK activo, deja pasar sin autenticación.
 *
 * Cuando Clerk esté configurado y el usuario no esté loguinado,
 * muestra la pantalla de sign-in centrada.
 */
import { Show, SignIn } from '@clerk/react'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const hasClerk = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)
  if (!hasClerk) return <>{children}</>

  return (
    <Show
      when="signed-in"
      fallback={
        <div className="min-h-screen bg-paper-100 flex items-center justify-center">
          <div className="text-center">
            <h1 className="font-serif text-3xl text-ink-700 mb-8">Trama</h1>
            <SignIn routing="hash" />
          </div>
        </div>
      }
    >
      {children}
    </Show>
  )
}
