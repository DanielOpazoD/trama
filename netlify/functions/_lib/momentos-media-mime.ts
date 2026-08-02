/**
 * Tipos de media que acepta Momentos, y la marca que distingue dónde vive el
 * blob. Módulo compartido a propósito (espejo de `library-upload-mime.ts`):
 * ahora hay DOS caminos de subida —multipart por la función y directo a R2 con
 * URL firmada— y si cada uno llevara su propia lista, aceptar un formato nuevo
 * en uno y no en el otro daría un fallo que depende del TAMAÑO del archivo. Ese
 * bug es casi imposible de reproducir a mano.
 */

/** Extensión por mimeType. Las claves son además la lista blanca. */
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

const ALLOWED_MIMES = new Set(Object.keys(EXT_BY_MIME))

export function isAllowedMomentoMime(mimeType: string): boolean {
  return ALLOWED_MIMES.has(mimeType)
}

/** Extensión (sin punto) del mime, o `bin` si no está en la lista. */
export function momentoExtensionFor(mimeType: string): string {
  return EXT_BY_MIME[mimeType] ?? 'bin'
}

/** Mensaje único para el 415, para que ambos caminos digan lo mismo. */
export const UNSUPPORTED_MOMENTO_MIME =
  'Usa una imagen (jpeg, png, webp, gif) o un video (mp4, webm, mov).'

/**
 * Prefijo que marca una clave almacenada en R2 en vez de Netlify Blobs.
 *
 * **Por qué en la clave y no en la base.** La Biblioteca puede permitirse una
 * columna `provider` porque tiene una tabla de manifiestos; en Momentos la
 * storageKey vive suelta dentro del JSON del momento, y el endpoint que sirve
 * recibe SOLO la clave. Marcarla la hace autodescriptiva: `momentos-file` decide
 * de dónde leer sin consultar nada.
 *
 * **Por qué es inequívoco.** El resto de la clave es hexadecimal
 * (`crypto.getRandomValues` → `toString(16)`), y el hex no contiene la letra
 * `r`. Ninguna clave ya persistida puede empezar por `r2-`.
 *
 * **Por qué no un segmento aparte.** La ruta declarada es `/:key` o
 * `/:userId/:key`: dos segmentos. Un `${userId}/r2/${hash}` serían tres y no
 * casaría con ninguna de las dos.
 */
export const R2_KEY_MARKER = 'r2-'

/** ¿Esta storageKey apunta a R2? Mira el tramo posterior al `${userId}/`. */
export function isR2MomentoKey(storageKey: string): boolean {
  const slashIdx = storageKey.indexOf('/')
  const tail = slashIdx > 0 ? storageKey.slice(slashIdx + 1) : storageKey
  return tail.startsWith(R2_KEY_MARKER)
}

/** Inverso de `EXT_BY_MIME`. Las extensiones no se repiten, así que es unívoco. */
const MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime]),
)

/**
 * ¿La key apunta a un video? Se decide por la EXTENSIÓN, que es fiable porque
 * ambos caminos de subida la derivan del mime ya validado (`momentoExtensionFor`),
 * nunca del nombre que mandó el cliente.
 *
 * Hace falta al adoptar un huérfano: el item del payload necesita `type: 'video'`
 * para que el álbum monte un `<video>` y no un `<img>` que nunca carga. La
 * alternativa —consultar la metadata del objeto— cuesta una llamada de red y no
 * existe para las keys de R2, que no guardan mime en el store.
 */
export function isVideoMomentoKey(storageKey: string): boolean {
  const dot = storageKey.lastIndexOf('.')
  if (dot < 0) return false
  const mime = MIME_BY_EXT[storageKey.slice(dot + 1).toLowerCase()]
  return mime !== undefined && mime.startsWith('video/')
}
