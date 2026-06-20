import { useEffect, useRef, useState } from 'react'
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

export function usePdfStudioStampAssets(userKey: string) {
  const [assets, setAssets] = useState<PdfStudioStampAsset[]>([])
  const removedIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    removedIdsRef.current = new Set()
    setAssets([])
    void listStampAssets(userKey).then((list) => {
      if (!alive) return
      setAssets((current) => mergeLoadedAssets(list, current, removedIdsRef.current))
    })
    return () => {
      alive = false
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
    setAssets((list) => sortAssets([asset, ...list]))
    void putStampAsset(userKey, asset)
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
    setAssets((list) => sortAssets([asset, ...list]))
    void putStampAsset(userKey, asset)
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
  }

  function remove(id: string) {
    removedIdsRef.current.add(id)
    setAssets((list) => list.filter((asset) => asset.id !== id))
    void deleteStampAsset(userKey, id)
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
    return touched
  }

  return {
    assets,
    createFromFile,
    createSignatureFromDataUrl,
    remove,
    rename,
    touch,
  }
}

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

function nextAssetId(kind: PdfStudioStampKind): string {
  return `${kind}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
}
