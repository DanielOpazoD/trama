import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('stale asset recovery', () => {
  beforeEach(() => {
    vi.resetModules()
    window.sessionStorage.clear()
  })

  it('detecta imports dinámicos obsoletos y recarga una sola vez', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    })
    const { isStaleAssetLoadError, requestReloadForStaleAsset } =
      await import('./staleAssetRecovery')

    const err = new TypeError(
      'Failed to fetch dynamically imported module: https://tramahub.app/assets/assemble-6PkgTIDP.js',
    )

    expect(isStaleAssetLoadError(err)).toBe(true)
    expect(requestReloadForStaleAsset(err)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)

    expect(requestReloadForStaleAsset(err)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
