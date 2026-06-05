import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// happy-dom trae un IntersectionObserver que nunca dispara. Los componentes que
// difieren trabajo hasta ser visibles (p. ej. el render de miniaturas del editor
// de PDF, vía `useInViewport`) necesitan que en tests se reporte "visible". Este
// mock invoca el callback con isIntersecting=true en cuanto se observa.
class ImmediateIntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: readonly number[] = []
  constructor(private readonly cb: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}
globalThis.IntersectionObserver =
  ImmediateIntersectionObserver as unknown as typeof IntersectionObserver

// Los tests corren en "modo legacy" de auth: sin Clerk en la UI. Vite
// inyecta VITE_CLERK_PUBLISHABLE_KEY desde .env.local también en modo test,
// lo que haría que <UserMenu> monte el <Show> de Clerk sin un
// <ClerkProvider> y reviente cualquier render que incluya el TopBar. La
// lógica de auth del backend se prueba aparte (mockeando @clerk/backend) en
// netlify/functions/_lib/auth.test.ts. Re-stub en cada test para sobrevivir
// a un eventual vi.unstubAllEnvs() de algún archivo.
beforeEach(() => {
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '')
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      writable: true,
      value: vi.fn(() => true),
    })
  }
})

afterEach(() => {
  cleanup()
})
