import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('installClientErrorTracking', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-31T12:00:00Z'))
    vi.resetModules()
  })

  it('envía errores globales por sendBeacon y throttlea duplicados', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    })
    const { installClientErrorTracking } = await import('./clientErrorTracking')

    installClientErrorTracking()
    installClientErrorTracking()

    const rejection = new Event('unhandledrejection')
    Object.defineProperty(rejection, 'reason', { value: new Error('boom') })
    window.dispatchEvent(rejection)
    window.dispatchEvent(rejection)

    expect(sendBeacon).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(60_001)
    const laterRejection = new Event('unhandledrejection')
    Object.defineProperty(laterRejection, 'reason', { value: { code: 'async boom' } })
    window.dispatchEvent(laterRejection)

    expect(sendBeacon).toHaveBeenCalledTimes(2)
  })

  it('usa fetch keepalive cuando sendBeacon no existe', async () => {
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: undefined,
    })
    const fetchMock = vi.spyOn(window, 'fetch').mockResolvedValue(new Response('{}'))
    const { installClientErrorTracking } = await import('./clientErrorTracking')

    installClientErrorTracking()
    const rejection = new Event('unhandledrejection')
    Object.defineProperty(rejection, 'reason', { value: 'x' })
    window.dispatchEvent(rejection)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/error-log',
      expect.objectContaining({ method: 'POST', keepalive: true }),
    )
  })
})
