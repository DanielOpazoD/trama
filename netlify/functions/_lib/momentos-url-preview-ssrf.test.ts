import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockContext } from './test-utils'
import handler, { isBlockedPreviewAddress } from '../momentos-url-preview'

describe('momentos-url-preview SSRF guard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(['127.0.0.1', '169.254.169.254', '10.0.0.1', '192.168.0.1', '[::1]'])(
    'bloquea %s antes de fetch',
    async (host) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const res = await handler(
        new Request(
          `http://localhost/api/momentos-url-preview?url=${encodeURIComponent(`http://${host}/meta`)}`,
        ),
        mockContext(),
      )

      expect(res.status).toBe(400)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('bloquea localhost resuelto por DNS antes de fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await handler(
      new Request(
        `http://localhost/api/momentos-url-preview?url=${encodeURIComponent('http://localhost/meta')}`,
      ),
      mockContext(),
    )

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clasifica rangos privados y loopback como bloqueados', () => {
    expect(isBlockedPreviewAddress('127.0.0.1')).toBe(true)
    expect(isBlockedPreviewAddress('169.254.169.254')).toBe(true)
    expect(isBlockedPreviewAddress('10.0.0.1')).toBe(true)
    expect(isBlockedPreviewAddress('192.168.0.1')).toBe(true)
    expect(isBlockedPreviewAddress('::1')).toBe(true)
    expect(isBlockedPreviewAddress('8.8.8.8')).toBe(false)
  })
})
