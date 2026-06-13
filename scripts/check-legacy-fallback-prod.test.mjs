import { describe, expect, it } from 'vitest'
import { checkLegacyFallbackProd } from './check-legacy-fallback-prod.mjs'

describe('checkLegacyFallbackProd', () => {
  it('rechaza producción con ALLOW_LEGACY_FALLBACK=true', () => {
    const result = checkLegacyFallbackProd({
      CONTEXT: 'production',
      CLERK_SECRET_KEY: 'sk_live_x',
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_x',
      ALLOW_LEGACY_FALLBACK: 'true',
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/ALLOW_LEGACY_FALLBACK=true/)
  })

  it('rechaza producción sin Clerk completo', () => {
    expect(checkLegacyFallbackProd({ CONTEXT: 'production' })).toMatchObject({
      ok: false,
    })
    expect(
      checkLegacyFallbackProd({
        CONTEXT: 'production',
        CLERK_SECRET_KEY: 'sk_live_x',
      }),
    ).toMatchObject({ ok: false })
  })

  it('permite dev local sin Clerk y producción estricta con fallback apagado', () => {
    expect(checkLegacyFallbackProd({ CONTEXT: 'deploy-preview' })).toEqual({ ok: true })
    expect(
      checkLegacyFallbackProd({
        NETLIFY_CONTEXT: 'production',
        CLERK_SECRET_KEY: 'sk_live_x',
        VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_x',
        ALLOW_LEGACY_FALLBACK: 'false',
      }),
    ).toEqual({ ok: true })
  })
})
