import { useEffect, useState } from 'react'
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

  useEffect(() => {
    let alive = true
    void listStampAssets(userKey).then((list) => {
      if (alive) setAssets(list)
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

function nextAssetId(kind: PdfStudioStampKind): string {
  return `${kind}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
}
