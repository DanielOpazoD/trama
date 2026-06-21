import { describe, expect, it } from 'vitest'
import { extractPhotoCapturedAt, pickOldestCapturedAt } from './photoExif'

function writeAscii(bytes: Uint8Array, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i)
}

function jpegWithExifDate(tag: 0x9003 | 0x9004, value: string): ArrayBuffer {
  const exifPayloadLength = 6 + 8 + 2 + 12 + 4 + 2 + 12 + 4 + 20
  const bytes = new Uint8Array(2 + 2 + 2 + exifPayloadLength + 2)
  let p = 0
  bytes[p++] = 0xff
  bytes[p++] = 0xd8
  bytes[p++] = 0xff
  bytes[p++] = 0xe1
  const app1Length = exifPayloadLength + 2
  bytes[p++] = (app1Length >> 8) & 0xff
  bytes[p++] = app1Length & 0xff
  writeAscii(bytes, p, 'Exif\0\0')
  p += 6

  const tiff = p
  bytes[p++] = 0x49
  bytes[p++] = 0x49
  bytes[p++] = 42
  bytes[p++] = 0
  new DataView(bytes.buffer).setUint32(p, 8, true)
  p += 4

  new DataView(bytes.buffer).setUint16(p, 1, true)
  p += 2
  new DataView(bytes.buffer).setUint16(p, 0x8769, true)
  p += 2
  new DataView(bytes.buffer).setUint16(p, 4, true)
  p += 2
  new DataView(bytes.buffer).setUint32(p, 1, true)
  p += 4
  new DataView(bytes.buffer).setUint32(p, 26, true)
  p += 4
  new DataView(bytes.buffer).setUint32(p, 0, true)
  p += 4

  p = tiff + 26
  new DataView(bytes.buffer).setUint16(p, 1, true)
  p += 2
  new DataView(bytes.buffer).setUint16(p, tag, true)
  p += 2
  new DataView(bytes.buffer).setUint16(p, 2, true)
  p += 2
  new DataView(bytes.buffer).setUint32(p, 20, true)
  p += 4
  new DataView(bytes.buffer).setUint32(p, 44, true)
  p += 4
  new DataView(bytes.buffer).setUint32(p, 0, true)
  writeAscii(bytes, tiff + 44, `${value}\0`)

  bytes[bytes.length - 2] = 0xff
  bytes[bytes.length - 1] = 0xd9
  return bytes.buffer
}

describe('photoExif', () => {
  it('lee DateTimeOriginal desde EXIF JPEG y lo normaliza a ISO local', () => {
    expect(extractPhotoCapturedAt(jpegWithExifDate(0x9003, '2024:02:03 04:05:06'))).toBe(
      '2024-02-03T04:05:06.000',
    )
  })

  it('usa CreateDate cuando no viene DateTimeOriginal', () => {
    expect(extractPhotoCapturedAt(jpegWithExifDate(0x9004, '2025:06:07 08:09:10'))).toBe(
      '2025-06-07T08:09:10.000',
    )
  })

  it('ignora buffers sin EXIF y fechas inválidas', () => {
    expect(
      extractPhotoCapturedAt(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer),
    ).toBeNull()
    expect(extractPhotoCapturedAt(jpegWithExifDate(0x9003, 'fecha mala'))).toBeNull()
  })

  it('elige la fecha más antigua disponible para episodios con varias fotos', () => {
    expect(
      pickOldestCapturedAt([null, '2026-06-20T14:00:00.000', '2026-06-19T23:10:00.000']),
    ).toBe('2026-06-19T23:10:00.000')
  })
})
