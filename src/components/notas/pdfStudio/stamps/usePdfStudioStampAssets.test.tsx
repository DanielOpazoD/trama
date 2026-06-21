import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PdfStudioStampAsset } from '../../../../lib/pdfStudio/stamps/stampAssets'

const listStampAssetsMock = vi.fn()
const putStampAssetMock = vi.fn()
const deleteStampAssetMock = vi.fn()
const cloudListMock = vi.fn()
const cloudCreateMock = vi.fn()
const cloudRenameMock = vi.fn()
const cloudRemoveMock = vi.fn()
const cloudTouchMock = vi.fn()

vi.mock('../../../../lib/pdfStudio/render/persistence', () => ({
  deleteStampAsset: (...args: unknown[]) => deleteStampAssetMock(...args),
  listStampAssets: (...args: unknown[]) => listStampAssetsMock(...args),
  putStampAsset: (...args: unknown[]) => putStampAssetMock(...args),
}))

vi.mock('../../../../api/pdfStampAssets', () => ({
  pdfStampAssetsApi: {
    create: (...args: unknown[]) => cloudCreateMock(...args),
    list: (...args: unknown[]) => cloudListMock(...args),
    remove: (...args: unknown[]) => cloudRemoveMock(...args),
    rename: (...args: unknown[]) => cloudRenameMock(...args),
    touch: (...args: unknown[]) => cloudTouchMock(...args),
  },
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
  window.localStorage.clear()
  listStampAssetsMock.mockReset()
  putStampAssetMock.mockReset()
  deleteStampAssetMock.mockReset()
  cloudListMock.mockReset()
  cloudCreateMock.mockReset()
  cloudRenameMock.mockReset()
  cloudRemoveMock.mockReset()
  cloudTouchMock.mockReset()
  listStampAssetsMock.mockResolvedValue([])
  putStampAssetMock.mockResolvedValue(undefined)
  deleteStampAssetMock.mockResolvedValue(undefined)
  cloudListMock.mockResolvedValue([])
  cloudCreateMock.mockImplementation(async (created) => created)
  cloudRenameMock.mockImplementation(async (id, name) =>
    asset({ id: String(id), name: String(name), updatedAt: 200 }),
  )
  cloudRemoveMock.mockResolvedValue(undefined)
  cloudTouchMock.mockImplementation(async (id) =>
    asset({ id: String(id), updatedAt: 250, lastUsedAt: 250 }),
  )
})

describe('usePdfStudioStampAssets', () => {
  it('hidrata desde la biblioteca cloud y la espeja en IndexedDB local', async () => {
    const cloudAsset = asset({ id: 'cloud-signature', updatedAt: 300 })
    cloudListMock.mockResolvedValueOnce([cloudAsset])
    listStampAssetsMock.mockResolvedValueOnce([asset({ id: 'cached-signature' })])

    const { result } = renderHook(() => usePdfStudioStampAssets('user-a'))

    await waitFor(() => expect(result.current.assets).toEqual([cloudAsset]))
    expect(result.current.syncStatus).toBe('cloud')
    expect(cloudListMock).toHaveBeenCalled()
    expect(putStampAssetMock).toHaveBeenCalledWith('user-a', cloudAsset)
  })

  it('usa IndexedDB como fallback si la biblioteca cloud falla', async () => {
    const cached = asset({ id: 'cached-signature' })
    cloudListMock.mockRejectedValueOnce(new Error('offline'))
    listStampAssetsMock.mockResolvedValueOnce([cached])

    const { result } = renderHook(() => usePdfStudioStampAssets('user-a'))

    await waitFor(() => expect(result.current.assets).toEqual([cached]))
    expect(result.current.syncStatus).toBe('local')
  })

  it('marca la biblioteca como local si falla la creación cloud optimista', async () => {
    cloudListMock.mockResolvedValueOnce([])
    cloudCreateMock.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => usePdfStudioStampAssets('user-a'))

    await act(async () => {
      await result.current.createSignatureFromDataUrl({
        name: 'Firma dibujada',
        src: pngSrc,
        width: 320,
        height: 120,
      })
    })

    await waitFor(() => expect(result.current.syncStatus).toBe('local'))
  })

  it('no permite que una hidratación tardía borre assets creados localmente', async () => {
    const load = deferred<PdfStudioStampAsset[]>()
    cloudListMock.mockReturnValueOnce(load.promise)
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

  it('no revive assets eliminados cuando una hidratación cloud llega tarde', async () => {
    const load = deferred<PdfStudioStampAsset[]>()
    const removedAsset = asset({ id: 'cloud-removed', updatedAt: 500 })
    cloudListMock.mockReturnValueOnce(load.promise)
    const { result } = renderHook(() => usePdfStudioStampAssets('user-a'))

    await act(async () => {
      await result.current.createSignatureFromDataUrl({
        name: 'Firma dibujada',
        src: pngSrc,
        width: 320,
        height: 120,
      })
    })
    const createdId = result.current.assets[0]!.id
    putStampAssetMock.mockClear()
    cloudCreateMock.mockClear()

    act(() => result.current.remove(createdId))
    expect(result.current.assets).toEqual([])

    await act(async () => {
      load.resolve([asset({ id: createdId, updatedAt: 50 }), removedAsset])
      await load.promise
    })

    await waitFor(() =>
      expect(result.current.assets.map((item) => item.id)).toEqual(['cloud-removed']),
    )
    expect(putStampAssetMock).not.toHaveBeenCalledWith(
      'user-a',
      expect.objectContaining({ id: createdId }),
    )
    expect(cloudCreateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: createdId }),
    )
  })

  it('no reimporta desde IndexedDB un asset eliminado antes de recargar', async () => {
    cloudListMock.mockResolvedValueOnce([])
    listStampAssetsMock.mockResolvedValueOnce([])
    const { result, unmount } = renderHook(() => usePdfStudioStampAssets('user-a'))

    await act(async () => {
      await result.current.createSignatureFromDataUrl({
        name: 'Firma dibujada',
        src: pngSrc,
        width: 320,
        height: 120,
      })
    })
    const createdId = result.current.assets[0]!.id
    act(() => result.current.remove(createdId))
    unmount()

    cloudCreateMock.mockClear()
    cloudListMock.mockResolvedValueOnce([])
    listStampAssetsMock.mockResolvedValueOnce([asset({ id: createdId })])
    const next = renderHook(() => usePdfStudioStampAssets('user-a'))

    await waitFor(() => expect(next.result.current.syncStatus).toBe('cloud'))
    expect(next.result.current.assets).toEqual([])
    expect(cloudCreateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: createdId }),
    )
  })

  it('limpia assets visibles al cambiar de userKey antes de completar la nueva lectura', async () => {
    const loadA = deferred<PdfStudioStampAsset[]>()
    const loadB = deferred<PdfStudioStampAsset[]>()
    cloudListMock.mockReturnValueOnce(loadA.promise).mockReturnValueOnce(loadB.promise)

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

  it('crea, renombra, toca y elimina en cloud manteniendo cache local', async () => {
    cloudListMock.mockResolvedValueOnce([])
    const { result } = renderHook(() => usePdfStudioStampAssets('user-a'))

    await act(async () => {
      await result.current.createSignatureFromDataUrl({
        name: 'Firma dibujada',
        src: pngSrc,
        width: 320,
        height: 120,
      })
    })
    const created = result.current.assets[0]!
    expect(cloudCreateMock).toHaveBeenCalledWith(created)
    expect(putStampAssetMock).toHaveBeenCalledWith('user-a', created)

    act(() => result.current.rename(created.id, 'Firma legal'))
    await waitFor(() =>
      expect(cloudRenameMock).toHaveBeenCalledWith(created.id, 'Firma legal'),
    )

    act(() => result.current.touch(created.id))
    await waitFor(() => expect(cloudTouchMock).toHaveBeenCalledWith(created.id))

    act(() => result.current.remove(created.id))
    await waitFor(() => expect(cloudRemoveMock).toHaveBeenCalledWith(created.id))
    expect(deleteStampAssetMock).toHaveBeenCalledWith('user-a', created.id)
  })
})
