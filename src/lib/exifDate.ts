/**
 * Lector mínimo, sin dependencias, de la fecha de captura de una imagen.
 *
 * Las fotos JPEG guardan la fecha en que se tomaron en el bloque EXIF
 * (`DateTimeOriginal`, tag 0x9003). La Biblioteca quiere ESA fecha — no la del
 * archivo ni la de subida — para ordenar y posicionar por cuándo se sacó la
 * foto. Acá la extraemos parseando el contenedor a mano:
 *
 *   JPEG = 0xFFD8 + una secuencia de segmentos `0xFF<marker> <len16> <datos>`.
 *   El segmento APP1 (0xFFE1) que empieza con "Exif\0\0" contiene un bloque TIFF
 *   con los IFDs. El IFD0 puede tener un puntero (tag 0x8769) al sub-IFD EXIF,
 *   donde vive `DateTimeOriginal` como ASCII "YYYY:MM:DD HH:MM:SS".
 *
 * Todo el parseo es defensivo (chequeos de límites): cualquier archivo que no
 * sea un JPEG con EXIF válido devuelve null y el llamador cae al `lastModified`.
 * No cubrimos HEIC/TIFF/PNG ni husos horarios EXIF (rara vez presentes): EXIF da
 * la hora local sin offset, así que la interpretamos como UTC de forma estable.
 */

const JPEG_SOI = 0xffd8
const APP1_MARKER = 0xffe1
const EXIF_HEADER = 'Exif\0\0'
const TAG_DATETIME_ORIGINAL = 0x9003
const TAG_DATETIME_DIGITIZED = 0x9004
const TAG_DATETIME = 0x0132
const TAG_EXIF_IFD_POINTER = 0x8769
/** type=2 (ASCII) en el formato de campo TIFF; es lo único que parseamos. */
const FIELD_TYPE_ASCII = 2

/**
 * Convierte un string EXIF "YYYY:MM:DD HH:MM:SS" a ISO. Devuelve null si no
 * matchea el formato o si los componentes no forman una fecha válida. Tratamos
 * la hora como UTC (EXIF no trae offset) para que el resultado sea determinista.
 */
export function parseExifDateString(value: string): string | null {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(value.trim())
  if (!match) return null
  const [, y, mo, d, h, mi, s] = match
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  const hour = Number(h)
  const minute = Number(mi)
  const second = Number(s)
  // EXIF "vacío" usa ceros (0000:00:00 00:00:00): no es una fecha real.
  if (year === 0 || month === 0 || day === 0) return null
  if (month > 12 || day > 31 || hour > 23 || minute > 59 || second > 59) return null
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (Number.isNaN(date.getTime())) return null
  // Date.UTC normaliza desbordes (p. ej. día 31 de un mes de 30); rechazamos si
  // los componentes no se preservan, así una fecha imposible no pasa silenciosa.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date.toISOString()
}

/** Lee un entero de 16 bits con el endianness dado, o null si se sale del buffer. */
function readUint16(view: DataView, offset: number, little: boolean): number | null {
  if (offset < 0 || offset + 2 > view.byteLength) return null
  return view.getUint16(offset, little)
}

/** Lee un entero de 32 bits con el endianness dado, o null si se sale del buffer. */
function readUint32(view: DataView, offset: number, little: boolean): number | null {
  if (offset < 0 || offset + 4 > view.byteLength) return null
  return view.getUint32(offset, little)
}

/** Lee `count` bytes ASCII desde `offset` y los devuelve como string (sin el \0). */
function readAscii(view: DataView, offset: number, count: number): string | null {
  if (count <= 0 || offset < 0 || offset + count > view.byteLength) return null
  let out = ''
  for (let i = 0; i < count; i++) {
    const code = view.getUint8(offset + i)
    if (code === 0) break
    out += String.fromCharCode(code)
  }
  return out
}

/**
 * Recorre las entradas de un IFD buscando un tag ASCII. `tiffStart` es el origen
 * del bloque TIFF (los offsets de valor son relativos a él). Devuelve el string
 * del primer tag que matchee `wantedTags`, o null. Si encuentra el puntero al
 * sub-IFD EXIF (0x8769), lo devuelve aparte para que el llamador lo recorra.
 */
function scanIfd(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  little: boolean,
  wantedTags: readonly number[],
): { value: string | null; exifIfdPointer: number | null } {
  const entryCount = readUint16(view, ifdOffset, little)
  if (entryCount === null) return { value: null, exifIfdPointer: null }

  let exifIfdPointer: number | null = null
  const ENTRY_SIZE = 12
  const firstEntry = ifdOffset + 2

  for (let i = 0; i < entryCount; i++) {
    const entry = firstEntry + i * ENTRY_SIZE
    const tag = readUint16(view, entry, little)
    if (tag === null) break

    if (tag === TAG_EXIF_IFD_POINTER) {
      const ptr = readUint32(view, entry + 8, little)
      if (ptr !== null) exifIfdPointer = tiffStart + ptr
      continue
    }

    if (wantedTags.includes(tag)) {
      const fieldType = readUint16(view, entry + 2, little)
      const count = readUint32(view, entry + 4, little)
      if (fieldType !== FIELD_TYPE_ASCII || count === null) continue
      // ASCII: si entra en 4 bytes va inline (entry+8); si no, entry+8 es un
      // offset (relativo al TIFF) donde están los bytes.
      const valueOffset =
        count <= 4 ? entry + 8 : tiffStart + (readUint32(view, entry + 8, little) ?? -1)
      const ascii = readAscii(view, valueOffset, count)
      if (ascii) return { value: ascii, exifIfdPointer }
    }
  }

  return { value: null, exifIfdPointer }
}

/**
 * Extrae la fecha de captura (ISO) de un buffer de imagen, o null si no es un
 * JPEG con EXIF legible. Busca `DateTimeOriginal`, luego `DateTimeDigitized` y
 * por último el `DateTime` genérico del IFD0.
 */
export function readExifDateFromBuffer(buffer: ArrayBuffer): string | null {
  const view = new DataView(buffer)
  // Mínimo: SOI + marcador APP1 + longitud.
  if (view.byteLength < 4) return null
  if (readUint16(view, 0, false) !== JPEG_SOI) return null

  // Recorre los segmentos buscando APP1/Exif. Cada segmento (salvo SOI) es
  // 0xFF<marker> seguido de un largo de 16 bits que incluye esos 2 bytes.
  let offset = 2
  let app1Start = -1
  while (offset + 4 <= view.byteLength) {
    const marker = readUint16(view, offset, false)
    if (marker === null) return null
    // Fuera del rango de marcadores de segmento → datos de imagen; paramos.
    if ((marker & 0xff00) !== 0xff00) break
    const segLength = readUint16(view, offset + 2, false)
    if (segLength === null || segLength < 2) break
    if (marker === APP1_MARKER) {
      const headerStart = offset + 4
      if (readAscii(view, headerStart, EXIF_HEADER.length) === 'Exif') {
        app1Start = headerStart
        break
      }
    }
    offset += 2 + segLength
  }
  if (app1Start < 0) return null

  // El bloque TIFF empieza justo después de "Exif\0\0".
  const tiffStart = app1Start + EXIF_HEADER.length
  const byteOrder = readUint16(view, tiffStart, false)
  if (byteOrder === null) return null
  // 'II' (0x4949) = little-endian; 'MM' (0x4D4D) = big-endian.
  const little = byteOrder === 0x4949
  if (!little && byteOrder !== 0x4d4d) return null

  // Tras el byte order va 0x002A (magic) y el offset al IFD0.
  const ifd0Offset = readUint32(view, tiffStart + 4, little)
  if (ifd0Offset === null) return null

  // IFD0: puede traer DateTime y/o el puntero al sub-IFD EXIF.
  const ifd0 = scanIfd(view, tiffStart, tiffStart + ifd0Offset, little, [TAG_DATETIME])

  // Preferimos las fechas del sub-IFD EXIF (original/digitalizada).
  if (ifd0.exifIfdPointer !== null) {
    const exif = scanIfd(view, tiffStart, ifd0.exifIfdPointer, little, [
      TAG_DATETIME_ORIGINAL,
      TAG_DATETIME_DIGITIZED,
    ])
    if (exif.value) {
      const iso = parseExifDateString(exif.value)
      if (iso) return iso
    }
  }

  // Fallback: el DateTime genérico del IFD0.
  if (ifd0.value) {
    const iso = parseExifDateString(ifd0.value)
    if (iso) return iso
  }

  return null
}

/**
 * Fecha de captura de un `File` como ISO. Para JPEG con EXIF usa
 * `DateTimeOriginal`; si no hay EXIF (u otro formato) cae a `lastModified`. Es
 * la entrada que usa la UI de subida para anclar cada imagen a su fecha real.
 */
export async function resolveCaptureDate(file: File): Promise<string> {
  const fallback = new Date(file.lastModified)
  const fallbackIso = Number.isNaN(fallback.getTime())
    ? new Date().toISOString()
    : fallback.toISOString()

  // Solo intentamos EXIF en JPEG (es donde vive). Cualquier fallo de lectura o
  // de parseo cae al fallback sin romper la subida.
  if (file.type !== 'image/jpeg' && file.type !== 'image/jpg') return fallbackIso
  try {
    const buffer = await file.arrayBuffer()
    const iso = readExifDateFromBuffer(buffer)
    return iso ?? fallbackIso
  } catch {
    return fallbackIso
  }
}
