import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Los tests corren en "modo legacy" de auth: sin Clerk en la UI. Vite
// inyecta VITE_CLERK_PUBLISHABLE_KEY desde .env.local también en modo test,
// lo que haría que <UserMenu> monte el <Show> de Clerk sin un
// <ClerkProvider> y reviente cualquier render que incluya el TopBar. La
// lógica de auth del backend se prueba aparte (mockeando @clerk/backend) en
// netlify/functions/_lib/auth.test.ts. Re-stub en cada test para sobrevivir
// a un eventual vi.unstubAllEnvs() de algún archivo.
beforeEach(() => {
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '')
})

afterEach(() => {
  cleanup()
})
