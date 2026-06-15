/**
 * Si la URL es un video de YouTube, devuelve su miniatura. Trama no guarda la
 * imagen: la deriva del id del video, así funciona retroactivamente con los
 * favoritos/recortes ya guardados. Soporta watch, youtu.be, shorts, live,
 * embed y los links intermedios `attribution_link` de YouTube.
 *
 * Devuelve `null` para cualquier URL que no apunte a un video (incluidas las
 * páginas de YouTube que no son videos, como /feed/subscriptions) y para
 * strings que no parsean como URL.
 */
export function youtubeThumb(url: string): string | null {
  const id = youtubeVideoId(url)
  if (!id) return null
  // hqdefault siempre existe (480×360, hasta para videos viejos); object-cover
  // recorta las barras del letterbox y la deja en 16:9 limpio.
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

const VIDEO_ID_RE = /^[\w-]{11}$/
const PATH_SEGMENT_KEYS = ['shorts', 'live', 'embed', 'v']

/** Extrae el id de 11 caracteres de un video de YouTube, o null. */
function youtubeVideoId(url: string, depth = 0): string | null {
  if (depth > 2) return null
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\./, '')

  if (host === 'youtu.be') {
    return cleanId(u.pathname.split('/').filter(Boolean)[0])
  }

  const isYouTubeHost =
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  if (!isYouTubeHost) return null

  // Link intermedio: el video real viaja codificado en el param `u`.
  if (u.pathname === '/attribution_link') {
    const nested = u.searchParams.get('u')
    if (!nested) return null
    return youtubeVideoId(
      new URL(nested, 'https://www.youtube.com').toString(),
      depth + 1,
    )
  }

  // /watch?v=ID y variantes con el id en query string.
  const fromQuery = cleanId(u.searchParams.get('v'))
  if (fromQuery) return fromQuery

  // /shorts/ID, /live/ID, /embed/ID, /v/ID
  const parts = u.pathname.split('/').filter(Boolean)
  const keyIdx = parts.findIndex((p) => PATH_SEGMENT_KEYS.includes(p))
  if (keyIdx >= 0) return cleanId(parts[keyIdx + 1])

  return null
}

/** Normaliza un candidato a id: exige los 11 caracteres válidos de YouTube. */
function cleanId(candidate: string | null | undefined): string | null {
  if (!candidate) return null
  const matched = candidate.match(/[\w-]{11}/)?.[0]
  return matched && VIDEO_ID_RE.test(matched) ? matched : null
}
