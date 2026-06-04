import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { setCurrentClientUserId } from '../lib/clientIdentity'

const getMock = vi.fn()
const saveMock = vi.fn()
vi.mock('../api', () => ({
  api: {
    userPrefs: {
      get: (...a: unknown[]) => getMock(...a),
      save: (...a: unknown[]) => saveMock(...a),
    },
  },
}))
const toastShow = vi.fn()
vi.mock('./toast', () => ({ useToast: () => ({ show: toastShow }) }))

import { readUserPrefsMirror, useSaveUserPrefs } from './useUserPrefs'

const MIRROR_KEY = 'trama:user-prefs'

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  getMock.mockReset()
  saveMock.mockReset()
  toastShow.mockReset()
  setCurrentClientUserId(null)
})
afterEach(() => setCurrentClientUserId(null))

describe('readUserPrefsMirror — scope por usuario (multiusuario)', () => {
  it('solo devuelve las prefs si el espejo pertenece al usuario actual', () => {
    setCurrentClientUserId('user-A')
    localStorage.setItem(
      MIRROR_KEY,
      JSON.stringify({ owner: 'user-A', prefs: { defaultWorld: 'notas' } }),
    )
    expect(readUserPrefsMirror()).toEqual({ defaultWorld: 'notas' })

    // Otro usuario en el mismo navegador → no ve el espejo ajeno.
    setCurrentClientUserId('user-B')
    expect(readUserPrefsMirror()).toEqual({})
  })

  it('sin Clerk (id null) el espejo con owner null funciona', () => {
    setCurrentClientUserId(null)
    localStorage.setItem(
      MIRROR_KEY,
      JSON.stringify({ owner: null, prefs: { visibleModules: { claves: false } } }),
    )
    expect(readUserPrefsMirror()).toEqual({ visibleModules: { claves: false } })
  })
})

describe('useSaveUserPrefs — optimista con rollback', () => {
  it('aplica el cambio al instante y revierte + avisa ante error', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['user-prefs'], { visibleModules: { claves: true } })
    // save queda pendiente hasta que la rechacemos a mano.
    let reject!: (e: unknown) => void
    saveMock.mockImplementationOnce(() => new Promise((_, r) => (reject = r)))

    const { result } = renderHook(() => useSaveUserPrefs(), { wrapper: wrapper(qc) })
    result.current.mutate({ visibleModules: { claves: false } })

    // Optimista: cache + espejo ya reflejan el cambio.
    await waitFor(() =>
      expect(qc.getQueryData(['user-prefs'])).toEqual({
        visibleModules: { claves: false },
      }),
    )

    reject(new Error('boom'))

    // Rollback al valor previo + toast de error.
    await waitFor(() =>
      expect(qc.getQueryData(['user-prefs'])).toEqual({
        visibleModules: { claves: true },
      }),
    )
    expect(toastShow).toHaveBeenCalled()
  })
})
