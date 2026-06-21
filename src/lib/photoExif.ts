const SOI = 0xffd8
const APP1 = 0xffe1
const EXIF_HEADER = 'Exif\0\0'
const TAG_EXIF_IFD = 0x8769
const TAG_DATE_TIME_ORIGINAL = 0x9003
const TAG_CREATE_DATE = 0x9004

type Endian = 'little' | 'big'

function readU16(view: DataView, offset: number, endian: Endian): number {
  return view.getUint16(offset, endian === 'little')
}

function readU32(view: DataView, offset: number, endian: Endian): number {
  return view.getUint32(offset, endian === 'little')
}

function asciiAt(view: DataView, offset: number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    const code = view.getUint8(offset + i)
    if (code === 0) break
    out += String.fromCharCode(code)
  }
  return out
}

function matchesAscii(view: DataView, offset: number, value: string): boolean {
  if (offset + value.length > view.byteLength) return false
  for (let i = 0; i < value.length; i++) {
    if (view.getUint8(offset + i) !== value.charCodeAt(i)) return false
  }
  return true
}

function readExifAscii(
  view: DataView,
  tiffStart: number,
  valueOffset: number,
  count: number,
): string | null {
  if (count <= 0) return null
  const absolute = tiffStart + valueOffset
  if (absolute < 0 || absolute + count > view.byteLength) return null
  return asciiAt(view, absolute, count).trim() || null
}

function parseExifDate(value: string): string | null {
  const match = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/)
  if (!match) return null
  const [, year, month, day, hour, minute, second] = match
  const mo = Number(month)
  const d = Number(day)
  const h = Number(hour)
  const mi = Number(minute)
  const s = Number(second)
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) {
    return null
  }
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000`
}

function findExifPayload(view: DataView): number | null {
  if (view.byteLength < 4 || view.getUint16(0) !== SOI) return null
  let offset = 2
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null
    const marker = view.getUint16(offset)
    const segmentLength = view.getUint16(offset + 2)
    if (segmentLength < 2) return null
    const segmentStart = offset + 4
    const segmentEnd = offset + 2 + segmentLength
    if (segmentEnd > view.byteLength) return null
    if (marker === APP1 && matchesAscii(view, segmentStart, EXIF_HEADER)) {
      return segmentStart + EXIF_HEADER.length
    }
    offset = segmentEnd
  }
  return null
}

function findDateInIfd(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  endian: Endian,
): {
  dateTimeOriginal: string | null
  createDate: string | null
  exifIfdOffset: number | null
} {
  const ifdStart = tiffStart + ifdOffset
  if (ifdStart < 0 || ifdStart + 2 > view.byteLength) {
    return { dateTimeOriginal: null, createDate: null, exifIfdOffset: null }
  }
  const count = readU16(view, ifdStart, endian)
  let dateTimeOriginal: string | null = null
  let createDate: string | null = null
  let exifIfdOffset: number | null = null
  for (let i = 0; i < count; i++) {
    const entry = ifdStart + 2 + i * 12
    if (entry + 12 > view.byteLength) break
    const tag = readU16(view, entry, endian)
    const type = readU16(view, entry + 2, endian)
    const valueCount = readU32(view, entry + 4, endian)
    const valueOffset = readU32(view, entry + 8, endian)
    if (tag === TAG_EXIF_IFD && type === 4) {
      exifIfdOffset = valueOffset
      continue
    }
    if (type !== 2) continue
    const raw = readExifAscii(view, tiffStart, valueOffset, valueCount)
    if (!raw) continue
    const parsed = parseExifDate(raw)
    if (!parsed) continue
    if (tag === TAG_DATE_TIME_ORIGINAL) dateTimeOriginal = parsed
    if (tag === TAG_CREATE_DATE) createDate = parsed
  }
  return { dateTimeOriginal, createDate, exifIfdOffset }
}

export function extractPhotoCapturedAt(buffer: ArrayBuffer): string | null {
  const view = new DataView(buffer)
  const tiffStart = findExifPayload(view)
  if (tiffStart === null || tiffStart + 8 > view.byteLength) return null
  const endianMarker = asciiAt(view, tiffStart, 2)
  const endian: Endian | null =
    endianMarker === 'II' ? 'little' : endianMarker === 'MM' ? 'big' : null
  if (!endian) return null
  if (readU16(view, tiffStart + 2, endian) !== 42) return null
  const firstIfdOffset = readU32(view, tiffStart + 4, endian)
  const first = findDateInIfd(view, tiffStart, firstIfdOffset, endian)
  if (first.dateTimeOriginal || first.createDate) {
    return first.dateTimeOriginal ?? first.createDate
  }
  if (first.exifIfdOffset === null) return null
  const exif = findDateInIfd(view, tiffStart, first.exifIfdOffset, endian)
  return exif.dateTimeOriginal ?? exif.createDate
}

export async function extractPhotoCapturedAtFromFile(file: File): Promise<string | null> {
  if (file.type !== 'image/jpeg') return null
  return extractPhotoCapturedAt(await file.arrayBuffer())
}

export function pickOldestCapturedAt(
  values: Array<string | null | undefined>,
): string | null {
  return (
    values
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null
  )
}
