import { fitImageStampBox, type PageLayout } from '../model/editorGeometry'
import { makeImageAnnotation, type ImageAnnotation } from '../model/model'

export type PdfStudioStampKind = 'signature' | 'stamp'

export type PdfStudioStampAsset = {
  id: string
  kind: PdfStudioStampKind
  name: string
  src: string
  mimeType: 'image/png' | 'image/jpeg'
  width: number
  height: number
  createdAt: number
  updatedAt: number
  lastUsedAt: number
}

export type PdfStudioStampAssetRecord = {
  userKey: string
  asset: PdfStudioStampAsset
}

export const STAMP_ASSET_ACCEPT = 'image/png,image/jpeg'

export function filterStampAssetsForUser(
  records: PdfStudioStampAssetRecord[],
  userKey: string,
): PdfStudioStampAsset[] {
  return records
    .filter((record) => record.userKey === userKey)
    .map((record) => record.asset)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function upsertStampAssetRecord(
  records: PdfStudioStampAssetRecord[],
  userKey: string,
  asset: PdfStudioStampAsset,
): PdfStudioStampAssetRecord[] {
  const next = records.filter(
    (record) => !(record.userKey === userKey && record.asset.id === asset.id),
  )
  return [...next, { userKey, asset }]
}

export function deleteStampAssetRecord(
  records: PdfStudioStampAssetRecord[],
  userKey: string,
  id: string,
): PdfStudioStampAssetRecord[] {
  return records.filter(
    (record) => !(record.userKey === userKey && record.asset.id === id),
  )
}

export function renameStampAsset(
  asset: PdfStudioStampAsset,
  name: string,
  now = Date.now(),
): PdfStudioStampAsset {
  const fallback = asset.kind === 'signature' ? 'Firma' : 'Timbre'
  return {
    ...asset,
    name: cleanAssetName(name, fallback),
    updatedAt: now,
  }
}

export function touchStampAsset(
  asset: PdfStudioStampAsset,
  now = Date.now(),
): PdfStudioStampAsset {
  return { ...asset, lastUsedAt: now, updatedAt: now }
}

export function createStampAssetFromDataUrl({
  id,
  kind,
  name,
  src,
  mimeType,
  width,
  height,
  now = Date.now(),
}: {
  id: string
  kind: PdfStudioStampKind
  name: string
  src: string
  mimeType: PdfStudioStampAsset['mimeType']
  width: number
  height: number
  now?: number
}): PdfStudioStampAsset {
  return {
    id,
    kind,
    name: cleanAssetName(name, kind === 'signature' ? 'Firma' : 'Timbre'),
    src,
    mimeType,
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
  }
}

export async function createStampAssetFromFile({
  file,
  id,
  kind,
  now = Date.now(),
}: {
  file: File
  id: string
  kind: PdfStudioStampKind
  now?: number
}): Promise<PdfStudioStampAsset | null> {
  if (!isStampAssetFile(file)) return null
  try {
    const mimeType = resolveStampMimeType(file)
    if (!mimeType) return null
    const src = await fileToDataUrl(file)
    const dataUrlMimeType = resolveStampDataUrlMimeType(src)
    if (
      dataUrlMimeType === 'unsupported' ||
      (dataUrlMimeType && dataUrlMimeType !== mimeType)
    ) {
      return null
    }
    const size = await readImageSize(src)
    return createStampAssetFromDataUrl({
      id,
      kind,
      name: file.name.replace(/\.[^.]+$/, ''),
      src,
      mimeType,
      width: size.width,
      height: size.height,
      now,
    })
  } catch {
    return null
  }
}

export function createImageAnnotationFromStampAsset({
  asset,
  layout,
  opacity,
}: {
  asset: PdfStudioStampAsset
  layout: PageLayout | null
  opacity?: number
}): ImageAnnotation {
  const box = fitImageStampBox({
    pageW: layout?.innerW ?? asset.width,
    pageH: layout?.innerH ?? asset.height,
    imageW: asset.width,
    imageH: asset.height,
  })
  return makeImageAnnotation({
    src: asset.src,
    ...box,
    opacity,
    assetId: asset.id,
    assetKind: asset.kind,
    label: asset.name,
  })
}

function cleanAssetName(name: string, fallback: string): string {
  return name.trim().replace(/\s+/g, ' ') || fallback
}

function isStampAssetFile(file: File): boolean {
  return resolveStampMimeType(file) !== null
}

function resolveStampMimeType(file: File): PdfStudioStampAsset['mimeType'] | null {
  const mimeFromType =
    file.type === 'image/png'
      ? 'image/png'
      : file.type === 'image/jpeg'
        ? 'image/jpeg'
        : null
  const mimeFromName = /\.png$/i.test(file.name)
    ? 'image/png'
    : /\.(jpe?g)$/i.test(file.name)
      ? 'image/jpeg'
      : null
  if (mimeFromType && mimeFromName && mimeFromType !== mimeFromName) return null
  return mimeFromType ?? mimeFromName
}

function resolveStampDataUrlMimeType(
  src: string,
): PdfStudioStampAsset['mimeType'] | 'unsupported' | null {
  const mime = /^data:([^;,]+)[;,]/i.exec(src)?.[1]?.toLowerCase()
  if (!mime) return null
  if (mime === 'image/png' || mime === 'image/jpeg') return mime
  return 'unsupported'
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('No se pudo leer la imagen'))
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer la imagen'))
    reader.readAsDataURL(file)
  })
}

function readImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () =>
      resolve({
        width: Math.max(1, image.naturalWidth || image.width),
        height: Math.max(1, image.naturalHeight || image.height),
      })
    image.onerror = () => reject(new Error('No se pudo decodificar la imagen'))
    image.src = src
  })
}
