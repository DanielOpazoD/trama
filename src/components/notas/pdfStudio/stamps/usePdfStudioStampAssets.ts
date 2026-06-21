import { useEffect, useRef, useState } from 'react'
import { pdfStampAssetsApi } from '../../../../api/pdfStampAssets'
import {
  createStampAssetFromDataUrl,
  createStampAssetFromFile,
  renameStampAsset,
  touchStampAsset,
  type PdfStudioStampAsset,
  type PdfStudioStampKind,
} from '../../../../lib/pdfStudio/stamps/stampAssets'
import {
  deleteStampAsset,
  listStampAssets,
  putStampAsset,
} from '../../../../lib/pdfStudio/render/persistence'

const REMOVED_STAMP_ASSETS_PREFIX = 'trama:pdf-stamp-assets:removed:'

export function usePdfStudioStampAssets(userKey: string) {
  const [assets, setAssets] = useState<PdfStudioStampAsset[]>([])
  const [syncStatus, setSyncStatus] = useState<PdfStudioStampSyncStatus>('syncing')
  const removedIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    removedIdsRef.current = loadRemovedStampAssetIds(userKey)
    setAssets([])
    setSyncStatus('syncing')
    void hydrateStampAssets(userKey)
    return () => {
      alive = false
    }

    async function hydrateStampAssets(currentUserKey: string) {
      try {
        const cloudAssets = await pdfStampAssetsApi.list()
        if (!alive) return
        if (cloudAssets.length > 0) {
          const visibleCloudAssets = filterRemovedAssets(
            cloudAssets,
            removedIdsRef.current,
          )
          setAssets((current) =>
            mergeLoadedAssets(visibleCloudAssets, current, removedIdsRef.current),
          )
          for (const asset of visibleCloudAssets) {
            void putStampAsset(currentUserKey, asset)
          }
          setSyncStatus('cloud')
          return
        }

        const localAssets = await listStampAssets(currentUserKey)
        if (!alive) return
        const visibleLocalAssets = filterRemovedAssets(localAssets, removedIdsRef.current)
        setAssets((current) =>
          mergeLoadedAssets(visibleLocalAssets, current, removedIdsRef.current),
        )
        for (const asset of visibleLocalAssets) {
          void syncAssetToCloud(asset)
        }
        setSyncStatus('cloud')
      } catch {
        const localAssets = await listStampAssets(currentUserKey)
        if (!alive) return
        const visibleLocalAssets = filterRemovedAssets(localAssets, removedIdsRef.current)
        setAssets((current) =>
          mergeLoadedAssets(visibleLocalAssets, current, removedIdsRef.current),
        )
        setSyncStatus('local')
      }
    }
  }, [userKey])

  async function createFromFile(
    kind: PdfStudioStampKind,
    file: File,
  ): Promise<PdfStudioStampAsset | null> {
    const asset = await createStampAssetFromFile({
      file,
      id: nextAssetId(kind),
      kind,
    })
    if (!asset) return null
    forgetRemovedStampAssetId(userKey, asset.id)
    removedIdsRef.current.delete(asset.id)
    setAssets((list) => sortAssets([asset, ...list]))
    void putStampAsset(userKey, asset)
    void syncAssetToCloud(asset)
    return asset
  }

  async function createSignatureFromDataUrl({
    name,
    src,
    width,
    height,
  }: {
    name: string
    src: string
    width: number
    height: number
  }): Promise<PdfStudioStampAsset> {
    const asset = createStampAssetFromDataUrl({
      id: nextAssetId('signature'),
      kind: 'signature',
      name,
      src,
      mimeType: 'image/png',
      width,
      height,
    })
    forgetRemovedStampAssetId(userKey, asset.id)
    removedIdsRef.current.delete(asset.id)
    setAssets((list) => sortAssets([asset, ...list]))
    void putStampAsset(userKey, asset)
    void syncAssetToCloud(asset)
    return asset
  }

  function rename(id: string, name: string) {
    setAssets((list) => {
      const next = sortAssets(
        list.map((asset) => (asset.id === id ? renameStampAsset(asset, name) : asset)),
      )
      const target = next.find((asset) => asset.id === id)
      if (target) void putStampAsset(userKey, target)
      return next
    })
    void pdfStampAssetsApi.rename(id, name).catch(() => undefined)
  }

  function remove(id: string) {
    removedIdsRef.current.add(id)
    rememberRemovedStampAssetId(userKey, id)
    setAssets((list) => list.filter((asset) => asset.id !== id))
    void deleteStampAsset(userKey, id)
    void pdfStampAssetsApi.remove(id).catch(() => undefined)
  }

  function touch(id: string): PdfStudioStampAsset | null {
    let touched: PdfStudioStampAsset | null = null
    setAssets((list) => {
      const next = sortAssets(
        list.map((asset) => {
          if (asset.id !== id) return asset
          touched = touchStampAsset(asset)
          return touched
        }),
      )
      if (touched) void putStampAsset(userKey, touched)
      return next
    })
    void pdfStampAssetsApi.touch(id).catch(() => undefined)
    return touched
  }

  return {
    assets,
    createFromFile,
    createSignatureFromDataUrl,
    remove,
    rename,
    syncStatus,
    touch,
  }

  function syncAssetToCloud(asset: PdfStudioStampAsset) {
    return pdfStampAssetsApi
      .create(asset)
      .then(() => setSyncStatus('cloud'))
      .catch(() => setSyncStatus('local'))
  }
}

export type PdfStudioStampSyncStatus = 'syncing' | 'cloud' | 'local'

function sortAssets(assets: PdfStudioStampAsset[]): PdfStudioStampAsset[] {
  return [...assets].sort((a, b) => b.updatedAt - a.updatedAt)
}

function mergeLoadedAssets(
  loaded: PdfStudioStampAsset[],
  current: PdfStudioStampAsset[],
  removedIds: Set<string>,
): PdfStudioStampAsset[] {
  const merged = new Map<string, PdfStudioStampAsset>()
  for (const asset of loaded) {
    if (!removedIds.has(asset.id)) merged.set(asset.id, asset)
  }
  for (const asset of current) {
    merged.set(asset.id, asset)
  }
  return sortAssets([...merged.values()])
}

function filterRemovedAssets(
  loaded: PdfStudioStampAsset[],
  removedIds: Set<string>,
): PdfStudioStampAsset[] {
  return loaded.filter((asset) => !removedIds.has(asset.id))
}

function removedStampAssetsKey(userKey: string): string {
  return `${REMOVED_STAMP_ASSETS_PREFIX}${userKey}`
}

function loadRemovedStampAssetIds(userKey: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(removedStampAssetsKey(userKey))
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(
      Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [],
    )
  } catch {
    return new Set()
  }
}

function saveRemovedStampAssetIds(userKey: string, ids: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      removedStampAssetsKey(userKey),
      JSON.stringify([...ids].slice(-200)),
    )
  } catch {
    // best-effort: runtime ref still protects the current session.
  }
}

function rememberRemovedStampAssetId(userKey: string, id: string): void {
  const ids = loadRemovedStampAssetIds(userKey)
  ids.add(id)
  saveRemovedStampAssetIds(userKey, ids)
}

function forgetRemovedStampAssetId(userKey: string, id: string): void {
  const ids = loadRemovedStampAssetIds(userKey)
  if (!ids.delete(id)) return
  saveRemovedStampAssetIds(userKey, ids)
}

function nextAssetId(kind: PdfStudioStampKind): string {
  return `${kind}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
}
