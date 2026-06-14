/**
 * Media entrante de WhatsApp (vía Twilio). Twilio adjunta los archivos como
 * `MediaUrl{i}` + `MediaContentType{i}` (cantidad en `NumMedia`). Las URLs
 * son privadas: hay que bajarlas con auth básica (Account SID + Auth Token).
 *
 * Este módulo es la base de ingest que reusan foto, audio y video.
 */

export type InboundMedia = { url: string; contentType: string }
export type MediaCategory = 'image' | 'audio' | 'video' | 'other'

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
 * Caption de un mensaje con media → destino + texto limpio. Default Recortes
 * (decisión del producto: la bandeja es el inbox natural de media cruda); el
 * usuario fuerza Momentos con `momento:`.
 */
export function mediaTarget(body: string): {
  target: 'momento' | 'recorte'
  caption: string
} {
  const m = /^\/?(momento|recorte)\s*:?\s*([\s\S]*)$/i.exec(body.trim())
  if (m) {
    return { target: m[1]!.toLowerCase() as 'momento' | 'recorte', caption: m[2]!.trim() }
  }
  return { target: 'recorte', caption: body.trim() }
}

/** Baja un archivo de media de Twilio (auth básica). Valida el host primero. */
export async function downloadTwilioMedia(
  url: string,
  accountSid: string,
  authToken: string,
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  if (!isTwilioMediaUrl(url)) {
    throw new Error('URL de media no pertenece a Twilio')
  }
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } })
  if (!res.ok) throw new Error(`Twilio media respondió ${res.status}`)
  const contentType = res.headers.get('content-type') ?? ''
  const buffer = await res.arrayBuffer()
  return { buffer, contentType }
}
