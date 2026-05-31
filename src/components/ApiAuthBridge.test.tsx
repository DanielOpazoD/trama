import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { request, setApiAuthTokenProvider } from '../api/request'
import { ApiAuthBridge } from './ApiAuthBridge'

const clerkAuth = vi.hoisted(() => ({
  getToken: vi.fn(async () => 'bridge-token'),
}))

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: clerkAuth.getToken }),
}))

describe('ApiAuthBridge', () => {
  afterEach(() => {
    setApiAuthTokenProvider(null)
    clerkAuth.getToken.mockClear()
    vi.unstubAllGlobals()
  })

  it('registers Clerk useAuth().getToken as the API token source', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<ApiAuthBridge />)
    await request('/api/home')

    expect(clerkAuth.getToken).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/home',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer bridge-token',
        }),
      }),
    )
  })
})
