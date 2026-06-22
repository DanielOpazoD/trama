import { describe, it, expect } from 'vitest'
import {
  parseExifDateString,
  readExifDateFromBuffer,
  resolveCaptureDate,
} from './exifDate'

/**
 * Construye un JPEG mínimo con un bloque EXIF que contiene un único
 * `DateTimeOriginal` (tag 0x9003), en little-endian. Es el camino feliz: SOI +
 * APP1("Exif\0\0" + TIFF) + EOI. Suficiente para ejercitar el parser real sin
 * depender de un binario externo.
 */
function buildJpegWithDateTimeOriginal(exifDate: string): ArrayBuffer {
  // --- Bloque TIFF (offsets relativos a su inicio) ---
  // header(8) + IFD0[1 entrada](2+12+4) + EXIF-IFD[1 entrada](2+12+4) + valor ASCII
  const asciiBytes = new TextEncoder().encode(exifDate + '\0')
  const TIFF_HEADER = 8
  const IFD0_OFFSET = TIFF_HEADER // 8
  const IFD0_SIZE = 2 + 12 + 4 // count + 1 entrada + nextIFD
  const EXIF_IFD_OFFSET = IFD0_OFFSET + IFD0_SIZE // 26
  const EXIF_IFD_SIZE = 2 + 12 + 4
  const VALUE_OFFSET = EXIF_IFD_OFFSET + EXIF_IFD_SIZE // donde van los bytes ASCII

  const tiffLen = VALUE_OFFSET + asciiBytes.length
  const tiff = new DataView(new ArrayBuffer(tiffLen))
  const LE = true

  // Header TIFF: 'II', magic 0x2A, offset a IFD0.
  tiff.setUint16(0, 0x4949, false) // 'II'
  tiff.setUint16(2, 0x002a, LE)
  tiff.setUint32(4, IFD0_OFFSET, LE)

  // IFD0: count(2) + 1 entrada(12) + nextIFD(4). La entrada arranca tras el
  // count (offset +2); su campo de valor está a +8 del inicio de la entrada.
  const ifd0Entry = IFD0_OFFSET + 2
  tiff.setUint16(IFD0_OFFSET, 1, LE) // entry count
  tiff.setUint16(ifd0Entry, 0x8769, LE) // tag: puntero al sub-IFD EXIF
  tiff.setUint16(ifd0Entry + 2, 4, LE) // type LONG
  tiff.setUint32(ifd0Entry + 4, 1, LE) // count
  tiff.setUint32(ifd0Entry + 8, EXIF_IFD_OFFSET, LE) // valor = offset al sub-IFD
  tiff.setUint32(ifd0Entry + 12, 0, LE) // next IFD = 0

  // Sub-IFD EXIF: count(2) + 1 entrada(12) + nextIFD(4).
  const exifEntry = EXIF_IFD_OFFSET + 2
  tiff.setUint16(EXIF_IFD_OFFSET, 1, LE) // entry count
  tiff.setUint16(exifEntry, 0x9003, LE) // tag: DateTimeOriginal
  tiff.setUint16(exifEntry + 2, 2, LE) // type ASCII
  tiff.setUint32(exifEntry + 4, asciiBytes.length, LE) // count (incluye \0)
  tiff.setUint32(exifEntry + 8, VALUE_OFFSET, LE) // offset al string (>4 bytes)
  tiff.setUint32(exifEntry + 12, 0, LE) // next IFD = 0

  for (let i = 0; i < asciiBytes.length; i++) {
    tiff.setUint8(VALUE_OFFSET + i, asciiBytes[i]!)
  }

  // --- Envoltura JPEG: SOI + APP1(len + "Exif\0\0" + TIFF) + EOI ---
  const exifHeader = new TextEncoder().encode('Exif\0\0')
  const app1PayloadLen = exifHeader.length + tiff.byteLength
  const app1Len = app1PayloadLen + 2 // el largo incluye sus 2 bytes
  const total = 2 + 2 + 2 + app1PayloadLen + 2 // SOI + marker + len + payload + EOI
  const out = new DataView(new ArrayBuffer(total))
  let p = 0
  out.setUint16(p, 0xffd8, false) // SOI
  p += 2
  out.setUint16(p, 0xffe1, false) // APP1
  p += 2
  out.setUint16(p, app1Len, false) // longitud big-endian
  p += 2
  for (let i = 0; i < exifHeader.length; i++) out.setUint8(p + i, exifHeader[i]!)
  p += exifHeader.length
  const tiffU8 = new Uint8Array(tiff.buffer)
  for (let i = 0; i < tiffU8.length; i++) out.setUint8(p + i, tiffU8[i]!)
  p += tiffU8.length
  out.setUint16(p, 0xffd9, false) // EOI
  return out.buffer
}

/**
 * Como el anterior pero con DOS fechas en el sub-IFD EXIF, con
 * DateTimeDigitized (0x9004) ANTES que DateTimeOriginal (0x9003) por orden de
 * archivo — para verificar que el parser prefiere Original por PRECEDENCIA, no
 * por el orden en que aparecen.
 */
function buildJpegWithBothDates(
  originalDate: string,
  digitizedDate: string,
): ArrayBuffer {
  const origBytes = new TextEncoder().encode(originalDate + '\0')
  const digBytes = new TextEncoder().encode(digitizedDate + '\0')
  const IFD0_OFFSET = 8
  const IFD0_SIZE = 2 + 12 + 4
  const EXIF_IFD_OFFSET = IFD0_OFFSET + IFD0_SIZE
  const EXIF_IFD_SIZE = 2 + 12 * 2 + 4 // count + 2 entradas + nextIFD
  const DIG_VALUE_OFFSET = EXIF_IFD_OFFSET + EXIF_IFD_SIZE
  const ORIG_VALUE_OFFSET = DIG_VALUE_OFFSET + digBytes.length
  const tiff = new DataView(new ArrayBuffer(ORIG_VALUE_OFFSET + origBytes.length))
  const LE = true

  tiff.setUint16(0, 0x4949, false) // 'II'
  tiff.setUint16(2, 0x002a, LE)
  tiff.setUint32(4, IFD0_OFFSET, LE)

  const ifd0Entry = IFD0_OFFSET + 2
  tiff.setUint16(IFD0_OFFSET, 1, LE)
  tiff.setUint16(ifd0Entry, 0x8769, LE) // puntero al sub-IFD EXIF
  tiff.setUint16(ifd0Entry + 2, 4, LE)
  tiff.setUint32(ifd0Entry + 4, 1, LE)
  tiff.setUint32(ifd0Entry + 8, EXIF_IFD_OFFSET, LE)
  tiff.setUint32(ifd0Entry + 12, 0, LE)

  tiff.setUint16(EXIF_IFD_OFFSET, 2, LE) // 2 entradas
  const e0 = EXIF_IFD_OFFSET + 2 // Digitized PRIMERO (por orden de archivo)
  tiff.setUint16(e0, 0x9004, LE)
  tiff.setUint16(e0 + 2, 2, LE)
  tiff.setUint32(e0 + 4, digBytes.length, LE)
  tiff.setUint32(e0 + 8, DIG_VALUE_OFFSET, LE)
  const e1 = e0 + 12 // Original SEGUNDO
  tiff.setUint16(e1, 0x9003, LE)
  tiff.setUint16(e1 + 2, 2, LE)
  tiff.setUint32(e1 + 4, origBytes.length, LE)
  tiff.setUint32(e1 + 8, ORIG_VALUE_OFFSET, LE)
  tiff.setUint32(e1 + 12, 0, LE) // next IFD = 0

  for (let i = 0; i < digBytes.length; i++)
    tiff.setUint8(DIG_VALUE_OFFSET + i, digBytes[i]!)
  for (let i = 0; i < origBytes.length; i++)
    tiff.setUint8(ORIG_VALUE_OFFSET + i, origBytes[i]!)

  // Envoltura JPEG (SOI + APP1 + EOI).
  const exifHeader = new TextEncoder().encode('Exif\0\0')
  const app1PayloadLen = exifHeader.length + tiff.byteLength
  const out = new DataView(new ArrayBuffer(2 + 2 + 2 + app1PayloadLen + 2))
  let p = 0
  out.setUint16(p, 0xffd8, false) // SOI
  p += 2
  out.setUint16(p, 0xffe1, false) // APP1
  p += 2
  out.setUint16(p, app1PayloadLen + 2, false) // longitud
  p += 2
  for (let i = 0; i < exifHeader.length; i++) out.setUint8(p + i, exifHeader[i]!)
  p += exifHeader.length
  const tiffU8 = new Uint8Array(tiff.buffer)
  for (let i = 0; i < tiffU8.length; i++) out.setUint8(p + i, tiffU8[i]!)
  p += tiffU8.length
  out.setUint16(p, 0xffd9, false) // EOI
  return out.buffer
}

describe('parseExifDateString', () => {
  it('convierte "YYYY:MM:DD HH:MM:SS" a ISO (interpretado como UTC)', () => {
    expect(parseExifDateString('2021:07:15 13:45:09')).toBe('2021-07-15T13:45:09.000Z')
  })

  it('rechaza el formato inválido', () => {
    expect(parseExifDateString('15/07/2021')).toBeNull()
    expect(parseExifDateString('not a date')).toBeNull()
    expect(parseExifDateString('')).toBeNull()
  })

  it('rechaza basura al final (regex anclada con $)', () => {
    expect(parseExifDateString('2021:07:15 13:45:09 y más')).toBeNull()
    expect(parseExifDateString('2021:07:15 13:45:0999')).toBeNull()
  })

  it('rechaza el EXIF "vacío" (ceros) y fechas imposibles', () => {
    expect(parseExifDateString('0000:00:00 00:00:00')).toBeNull()
    expect(parseExifDateString('2021:13:01 00:00:00')).toBeNull()
    expect(parseExifDateString('2021:02:31 00:00:00')).toBeNull()
  })
})

describe('readExifDateFromBuffer', () => {
  it('lee DateTimeOriginal de un JPEG con EXIF', () => {
    const buf = buildJpegWithDateTimeOriginal('2019:03:21 08:30:00')
    expect(readExifDateFromBuffer(buf)).toBe('2019-03-21T08:30:00.000Z')
  })

  it('prefiere DateTimeOriginal sobre DateTimeDigitized aunque aparezca después', () => {
    const buf = buildJpegWithBothDates('2018:11:09 17:20:00', '2020:01:01 00:00:00')
    expect(readExifDateFromBuffer(buf)).toBe('2018-11-09T17:20:00.000Z')
  })

  it('devuelve null para un buffer que no es JPEG', () => {
    const notJpeg = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]).buffer // PNG
    expect(readExifDateFromBuffer(notJpeg)).toBeNull()
  })

  it('devuelve null para un JPEG sin bloque EXIF', () => {
    // SOI + EOI, sin APP1.
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer
    expect(readExifDateFromBuffer(bare)).toBeNull()
  })

  it('no rompe con un buffer truncado / vacío', () => {
    expect(readExifDateFromBuffer(new ArrayBuffer(0))).toBeNull()
    expect(readExifDateFromBuffer(new Uint8Array([0xff]).buffer)).toBeNull()
  })
})

describe('resolveCaptureDate', () => {
  it('usa lastModified cuando no hay EXIF (no-JPEG)', async () => {
    const lastModified = Date.UTC(2020, 0, 2, 3, 4, 5) // 2020-01-02T03:04:05Z
    const file = new File(['hello'], 'nota.txt', { type: 'text/plain', lastModified })
    expect(await resolveCaptureDate(file)).toBe(new Date(lastModified).toISOString())
  })

  it('usa lastModified para un JPEG sin EXIF', async () => {
    const lastModified = Date.UTC(2022, 5, 1, 0, 0, 0)
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    const file = new File([bare], 'foto.jpg', { type: 'image/jpeg', lastModified })
    expect(await resolveCaptureDate(file)).toBe(new Date(lastModified).toISOString())
  })

  it('prefiere la fecha EXIF sobre lastModified en un JPEG con EXIF', async () => {
    const buf = buildJpegWithDateTimeOriginal('2018:11:09 17:20:00')
    const file = new File([buf], 'foto.jpg', {
      type: 'image/jpeg',
      lastModified: Date.UTC(2024, 0, 1),
    })
    expect(await resolveCaptureDate(file)).toBe('2018-11-09T17:20:00.000Z')
  })
})
