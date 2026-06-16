/**
 * Media entrante de WhatsApp (vía Twilio). Twilio adjunta los archivos como
 * `MediaUrl{i}` + `MediaContentType{i}` (cantidad en `NumMedia`). Las URLs
 * son privadas: hay que bajarlas con auth básica (Account SID + Auth Token).
 *
 * Este módulo es la base de ingest que reusan foto, audio y video.
 */

export type InboundMedia = { url: string; contentType: string }
export type MediaCategory = 'image' | 'audio' | 'video' | 'other'

/**
 * Tope de tamaño para media entrante. WhatsApp/Twilio ya limita el envío
 * (~16 MB), pero lo reforzamos del lado nuestro: evita que un adjunto enorme
 * agote memoria del function o llene Blobs. Si se excede, abortamos la
 * descarga con `MEDIA_TOO_LARGE` y el webhook avisa con un mensaje claro.
 */
export const MAX_MEDIA_BYTES = 16 * 1024 * 1024

/** Sentinel de error (no clase, para sobrevivir al bundling). */
export const MEDIA_TOO_LARGE = 'media-too-large'

/** MIME de imagen que sabemos guardar y renderizar (los que mapea extFromMime). */
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/** ¿Es un tipo de imagen soportado? (HEIC/TIFF/etc. quedan fuera por ahora). */
export function isAllowedImageMime(contentType: string): boolean {
  return ALLOWED_IMAGE_MIME.has(contentType.split(';')[0]!.trim().toLowerCase())
}

/**
 * Formatos de audio que Whisper transcribe. WhatsApp manda ogg/opus; otros
 * (amr, 3gpp) NO los acepta OpenAI, así que quedan fuera (se avisa al usuario).
 */
const TRANSCRIBABLE_AUDIO_MIME = new Set([
  'audio/ogg',
  'audio/oga',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/flac',
])

/** ¿Este audio lo sabe transcribir Whisper? */
export function isTranscribableAudioMime(contentType: string): boolean {
  return TRANSCRIBABLE_AUDIO_MIME.has(contentType.split(';')[0]!.trim().toLowerCase())
}

/** Extensión de archivo de audio por MIME (OpenAI olfatea por nombre). */
export function audioExtFromMime(mime: string): string {
  const map: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/oga': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'mp4',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/webm': 'webm',
    'audio/flac': 'flac',
  }
  return map[mime.split(';')[0]!.trim().toLowerCase()] ?? 'ogg'
}

/** Lee la lista de adjuntos del body form-encoded de Twilio. */
export function parseInboundMedia(params: Record<string, string>): InboundMedia[] {
  const n = Number.parseInt(params.NumMedia ?? '0', 10)
  if (!Number.isFinite(n) || n <= 0) return []
  const out: InboundMedia[] = []
  for (let i = 0; i < n; i++) {
    const url = params[`MediaUrl${i}`]
    if (url) out.push({ url, contentType: params[`MediaContentType${i}`] ?? '' })
  }
  return out
}

/** Guard SSRF: solo bajamos media de dominios de Twilio sobre https. */
export function isTwilioMediaUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.protocol === 'https:' &&
      (u.hostname === 'api.twilio.com' || u.hostname.endsWith('.twilio.com'))
    )
  } catch {
    return false
  }
}

export function mediaCategory(contentType: string): MediaCategory {
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('audio/')) return 'audio'
  if (contentType.startsWith('video/')) return 'video'
  return 'other'
}

/** Extensión de archivo por MIME (solo imágenes por ahora; el resto → bin). */
export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  return map[mime.split(';')[0]!.trim()] ?? 'bin'
}

/**
 * Destino de una foto según su caption:
 * - sin prefijo o `recorte:` → Recorte (inbox natural de media cruda).
 * - `momento:` → Momento foto.
 * - `cita:` → visión/OCR extrae cita + autor → Cita.
 * - `nota:` / `texto:` / `ocr:` → visión/OCR transcribe → Nota.
 *
 * Los dos últimos son "rutas de visión" (llaman LLM); los dos primeros no.
 */
export type MediaRoute = 'momento' | 'recorte' | 'quote' | 'note'

/**
 * Normaliza un caption para comparaciones tolerantes: quita acentos (NFD +
 * strip de diacríticos), pasa a minúsculas y recorta. Mismo criterio que el
 * `fold()` de `parse-command.ts` para los mensajes de texto.
 */
function foldCaption(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Intención en lenguaje natural de mandar la foto a Momentos, sin el prefijo
 * `momento:`. Cubre frases tipo «subir a momentos», «a momentos», «guardar en
 * momentos» o el escueto «momentos», y ADEMÁS acepta texto descriptivo después
 * de la directiva («a momentos ambas imágenes», «subir a momentos las del
 * torneo») — ese texto es solo aclaración, no cambia el destino.
 *
 * La clave para no confundir un pie meramente descriptivo (p. ej. «momentos
 * felices del viaje» → debe quedar en Recorte) es exigir una **preposición de
 * dirección** (a/al/en/para/hacia) antes de «momentos» cuando hay más texto: esa
 * preposición es la señal de "mandar A momentos". El escueto «momento(s)» (sin
 * nada más) también vale. Corre sobre el caption "folded" (sin acentos).
 */
const VERBS =
  'subir?|subila|subilo|sube|subela|subelo|guardar?|guarda|guardala|guardalo|mover|muevela|muevelo|mandar?|manda|mandala|mandalo|enviar?|envia|enviala|envialo|poner?|pon|ponla|ponlo|anadir?|anade|agregar?|agrega|llevar?|lleva'
const ARTICLES = '(?:(?:la|el|los|las|mi|mis)\\s+)?(?:seccion\\s+(?:de\\s+)?)?'
// Directiva con preposición obligatoria → permite texto descriptivo después.
const MOMENTO_DIRECTIVE = new RegExp(
  `^(?:(?:${VERBS})\\b\\s+)?(?:a|al|en|para|hacia)\\s+${ARTICLES}momentos?\\b`,
)
// El escueto «momento»/«momentos» (sin nada más).
const MOMENTO_BARE = /^momentos?$/

/** ¿El caption (en lenguaje natural) pide mandar la foto a Momentos? */
export function isMomentoCaption(body: string): boolean {
  const folded = foldCaption(body)
  return MOMENTO_BARE.test(folded) || MOMENTO_DIRECTIVE.test(folded)
}

export function mediaRoute(body: string): { route: MediaRoute; caption: string } {
  // 1) Prefijo explícito: `momento:`, `recorte:`, `cita:`, `nota:`, `texto:`,
  //    `ocr:`. El `\b` exige que el keyword sea una palabra completa, así
  //    «momentos felices» ya no matchea «momento» como prefijo (caía a un
  //    caption basura "s felices"); pasa al detector de lenguaje natural.
  const m = /^\/?(momento|recorte|cita|nota|texto|ocr)\b\s*:?\s*([\s\S]*)$/i.exec(
    body.trim(),
  )
  if (m) {
    const kw = m[1]!.toLowerCase()
    const route: MediaRoute =
      kw === 'momento'
        ? 'momento'
        : kw === 'cita'
          ? 'quote'
          : kw === 'nota' || kw === 'texto' || kw === 'ocr'
            ? 'note'
            : 'recorte'
    return { route, caption: m[2]!.trim() }
  }
  // 2) Lenguaje natural: «subir a momentos», «a momentos», «momentos»… El
  //    caption queda vacío porque la frase es una instrucción, no contenido.
  if (isMomentoCaption(body)) {
    return { route: 'momento', caption: '' }
  }
  // 3) Default: Recorte (inbox natural de media cruda).
  return { route: 'recorte', caption: body.trim() }
}

/** ¿Esta ruta requiere pasar la imagen por el LLM de visión? */
export function isVisionRoute(route: MediaRoute): boolean {
  return route === 'quote' || route === 'note'
}

/** Timeout por intento de descarga (la function tiene presupuesto acotado). */
export const TWILIO_FETCH_TIMEOUT_MS = 15000

/** Backoff por defecto: 3 intentos (inmediato, +0.5 s, +1.5 s). */
const DEFAULT_RETRY_DELAYS_MS = [0, 500, 1500]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** fetch con AbortController para no quedar colgados si Twilio no responde. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

export type DownloadOptions = {
  maxBytes?: number
  /** Delays entre intentos (longitud = nº de intentos). Default 3 intentos. */
  retryDelaysMs?: number[]
  timeoutMs?: number
  /** Notifica reintentos (observabilidad); el caller decide qué loguear. */
  onRetry?: (attempt: number, reason: string) => void
}

/**
 * Baja un archivo de media de Twilio (auth básica) con resiliencia:
 *
 * - Valida el host (SSRF) antes de cualquier request.
 * - Timeout por intento + reintentos con backoff SOLO en fallas transitorias
 *   (red, timeout, 5xx, 429). Los 4xx (auth/URL mala) y `MEDIA_TOO_LARGE` son
 *   permanentes: cortan sin reintentar (reintentar no ayuda y enmascara bugs).
 * - Tope de tamaño: mira `Content-Length` (corta sin transferir) y revalida el
 *   buffer real. Lanza `Error(MEDIA_TOO_LARGE)` para que el webhook distinga
 *   "muy grande" de un fallo de red.
 */
export async function downloadTwilioMedia(
  url: string,
  accountSid: string,
  authToken: string,
  opts: DownloadOptions = {},
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  if (!isTwilioMediaUrl(url)) {
    throw new Error('URL de media no pertenece a Twilio')
  }
  const maxBytes = opts.maxBytes ?? MAX_MEDIA_BYTES
  const delays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const timeoutMs = opts.timeoutMs ?? TWILIO_FETCH_TIMEOUT_MS
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const init: RequestInit = { headers: { Authorization: `Basic ${auth}` } }

  let lastError: unknown = null
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (attempt > 0) {
      opts.onRetry?.(attempt, lastError instanceof Error ? lastError.message : 'retry')
    }
    const delay = delays[attempt] ?? 0
    if (delay > 0) await sleep(delay)
    let res: Response
    try {
      res = await fetchWithTimeout(url, init, timeoutMs)
    } catch (err) {
      lastError = err // red/timeout (abort) → transitorio, reintentar
      continue
    }
    if (res.ok) {
      const declared = Number.parseInt(res.headers.get('content-length') ?? '', 10)
      if (Number.isFinite(declared) && declared > maxBytes) {
        throw new Error(MEDIA_TOO_LARGE)
      }
      const contentType = res.headers.get('content-type') ?? ''
      const buffer = await res.arrayBuffer()
      if (buffer.byteLength > maxBytes) throw new Error(MEDIA_TOO_LARGE)
      return { buffer, contentType }
    }
    if (res.status >= 500 || res.status === 429) {
      lastError = new Error(`Twilio media respondió ${res.status}`) // transitorio
      continue
    }
    throw new Error(`Twilio media respondió ${res.status}`) // 4xx → permanente
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Twilio media: fallo tras reintentos')
}
