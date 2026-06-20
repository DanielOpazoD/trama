import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PdfStudioStampAsset } from '../../../../lib/pdfStudio/stamps/stampAssets'

const listStampAssetsMock = vi.fn()
const putStampAssetMock = vi.fn()
const deleteStampAssetMock = vi.fn()

vi.mock('../../../../lib/pdfStudio/render/persistence', () => ({
  deleteStampAsset: (...args: unknown[]) => deleteStampAssetMock(...args),
  listStampAssets: (...args: unknown[]) => listStampAssetsMock(...args),
  putStampAsset: (...args: unknown[]) => putStampAssetMock(...args),
}))

import { usePdfStudioStampAssets } from './usePdfStudioStampAssets'

const pngSrc =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

function asset(overrides: Partial<PdfStudioStampAsset> = {}): PdfStudioStampAsset {
  return {
    id: 'asset-a',
    kind: 'signature',
    name: 'Firma local',
    src: pngSrc,
    mimeType: 'image/png',
    width: 320,
    height: 120,
    createdAt: 100,
    updatedAt: 100,
    lastUsedAt: 100,
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}

beforeEach(() => {
  listStampAssetsMock.mockReset()
  putStampAssetMock.mockReset()
  deleteStampAssetMock.mockReset()
  putStampAssetMock.mockResolvedValue(undefined)
  deleteStampAssetMock.mockResolvedValue(undefined)
})

describe('usePdfStudioStampAssets', () => {
  it('no permite que una hidratación tardía borre assets creados localmente', async () => {
    const load = deferred<PdfStudioStampAsset[]>()
    listStampAssetsMock.mockReturnValueOnce(load.promise)
    const { result } = renderHook(() => usePdfStudioStampAssets('user-a'))

    await act(async () => {
      await result.current.createSignatureFromDataUrl({
        name: 'Firma dibujada',
        src: pngSrc,
        width: 320,
        height: 120,
      })
    })

    expect(result.current.assets).toHaveLength(1)
    const createdId = result.current.assets[0]?.id

    await act(async () => {
      load.resolve([asset({ id: 'stored-asset', updatedAt: 50 })])
      await load.promise
    })

    await waitFor(() =>
      expect(result.current.assets.map((item) => item.id)).toEqual(
        expect.arrayContaining([createdId, 'stored-asset']),
      ),
    )
  })

  it('limpia assets visibles al cambiar de userKey antes de completar la nueva lectura', async () => {
    const loadA = deferred<PdfStudioStampAsset[]>()
    const loadB = deferred<PdfStudioStampAsset[]>()
    listStampAssetsMock
      .mockReturnValueOnce(loadA.promise)
      .mockReturnValueOnce(loadB.promise)

    const { result, rerender } = renderHook(
      ({ userKey }) => usePdfStudioStampAssets(userKey),
      { initialProps: { userKey: 'user-a' } },
    )

    await act(async () => {
      loadA.resolve([asset({ id: 'user-a-signature' })])
      await loadA.promise
    })
    await waitFor(() => expect(result.current.assets).toHaveLength(1))

    rerender({ userKey: 'user-b' })

    await waitFor(() => expect(result.current.assets).toEqual([]))
  })
})
