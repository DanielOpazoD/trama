import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createImageAnnotationFromStampAsset,
  createStampAssetFromDataUrl,
  createStampAssetFromFile,
  deleteStampAssetRecord,
  filterStampAssetsForUser,
  renameStampAsset,
  touchStampAsset,
  upsertStampAssetRecord,
  type PdfStudioStampAsset,
} from './stampAssets'

const pngSrc =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

function asset(overrides: Partial<PdfStudioStampAsset> = {}): PdfStudioStampAsset {
  return {
    id: 'asset-a',
    kind: 'signature',
    name: 'Firma principal',
    src: pngSrc,
    mimeType: 'image/png',
    width: 720,
    height: 220,
    createdAt: 100,
    updatedAt: 100,
    lastUsedAt: 100,
    ...overrides,
  }
}

describe('pdfStudio/stamps/stampAssets', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('mantiene la biblioteca aislada por userKey en records locales', () => {
    const records = [
      { userKey: 'user-a', asset: asset({ id: 'a', name: 'Firma A' }) },
      { userKey: 'user-b', asset: asset({ id: 'b', name: 'Timbre B', kind: 'stamp' }) },
    ]

    expect(filterStampAssetsForUser(records, 'user-a').map((item) => item.id)).toEqual([
      'a',
    ])
    expect(filterStampAssetsForUser(records, 'user-b').map((item) => item.id)).toEqual([
      'b',
    ])
  })

  it('crea, renombra, toca y elimina assets sin mezclar usuarios', () => {
    const original = asset({ id: 'shared-id', name: 'Firma vieja' })
    const userB = asset({ id: 'shared-id', name: 'Firma otro usuario' })
    let records = upsertStampAssetRecord([], 'user-a', original)
    records = upsertStampAssetRecord(records, 'user-b', userB)

    const renamed = renameStampAsset(original, ' Firma nueva ', 250)
    records = upsertStampAssetRecord(records, 'user-a', renamed)

    expect(filterStampAssetsForUser(records, 'user-a')[0]).toMatchObject({
      id: 'shared-id',
      name: 'Firma nueva',
      updatedAt: 250,
    })
    expect(filterStampAssetsForUser(records, 'user-b')[0]).toMatchObject({
      id: 'shared-id',
      name: 'Firma otro usuario',
    })

    records = upsertStampAssetRecord(records, 'user-a', touchStampAsset(renamed, 300))
    expect(filterStampAssetsForUser(records, 'user-a')[0]?.lastUsedAt).toBe(300)

    records = deleteStampAssetRecord(records, 'user-a', 'shared-id')
    expect(filterStampAssetsForUser(records, 'user-a')).toEqual([])
    expect(filterStampAssetsForUser(records, 'user-b')).toHaveLength(1)
  })

  it('crea assets de firma desde data URL dibujada con metadata estable', () => {
    const created = createStampAssetFromDataUrl({
      id: 'drawn',
      kind: 'signature',
      name: '',
      src: pngSrc,
      mimeType: 'image/png',
      width: 720,
      height: 220,
      now: 500,
    })

    expect(created).toMatchObject({
      id: 'drawn',
      kind: 'signature',
      name: 'Firma',
      src: pngSrc,
      mimeType: 'image/png',
      width: 720,
      height: 220,
      createdAt: 500,
      updatedAt: 500,
      lastUsedAt: 500,
    })
  })

  it('inserta firma/timbre como ImageAnnotation con tamaño ajustado al layout', () => {
    const annotation = createImageAnnotationFromStampAsset({
      asset: asset({ id: 'stamp-1', kind: 'stamp', name: 'Timbre clínica' }),
      layout: { innerW: 800, innerH: 1000, outerW: 800, outerH: 1000, rot: 0 },
      opacity: 0.7,
    })

    expect(annotation).toMatchObject({
      kind: 'image',
      src: pngSrc,
      opacity: 0.7,
      assetId: 'stamp-1',
      assetKind: 'stamp',
      label: 'Timbre clínica',
    })
    expect(annotation.wRatio).toBeGreaterThan(0)
    expect(annotation.hRatio).toBeGreaterThan(0)
    expect(annotation.xRatio).toBeGreaterThanOrEqual(0)
    expect(annotation.yRatio).toBeGreaterThanOrEqual(0)
  })

  it('rechaza archivos con MIME no soportado aunque la extensión parezca válida', async () => {
    const file = new File(['gif'], 'firma.jpg', { type: 'image/gif' })

    await expect(
      createStampAssetFromFile({
        file,
        id: 'asset-file',
        kind: 'signature',
      }),
    ).resolves.toBeNull()
  })

  it('normaliza fallos de decodificación de imagen a null', async () => {
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null

        set src(_value: string) {
          queueMicrotask(() => this.onerror?.())
        }
      },
    )

    const file = new File(['not-an-image'], 'firma.png', { type: 'image/png' })

    await expect(
      createStampAssetFromFile({
        file,
        id: 'broken-image',
        kind: 'signature',
      }),
    ).resolves.toBeNull()
  })
})
