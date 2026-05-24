import type { Config } from '@netlify/functions'
import { withObservability } from './_lib/handler-wrap.js'

/**
 * GET /api/momentos/url-preview?url=https://example.com
 *
 * Fetch server-side de los meta tags OG/Twitter de una URL para precargar
 * el composer de Recortes. Sirve para:
 *   - title (og:title o <title>)
 *   - description (og:description)
 *   - source / domain (host bonito)
 *   - author (og:article:author si existe)
 *   - image (og:image — solo URL, no la descargamos)
 *
 * No es magia: muchas páginas bloquean fetch de bots (Twitter es el clásico)
 * o redirigen a login. Devolvemos lo que conseguimos; si nada, devolvemos
 * un objeto con source/domain igual para que la UI al menos pre-rellene
 * eso. NUNCA error 500 — la UI cae a entrada manual.
 *
 * Timeout corto (5s) para que el composer no se quede colgado.
 */

const TIMEOUT_MS = 5000
const MAX_HTML_BYTES = 256 * 1024 // 256KB — más que suficiente para <head>

type Preview = {
  url: string
  title: string | null
  description: string | null
  source: string | null
  author: string | null
  image: string | null
  fetched: boolean
}

function emptyPreview(url: string, source: string | null): Preview {
  return {
    url,
    title: null,
    description: null,
    source,
    author: null,
    image: null,
    fetched: false,
  }
}

/** Extrae el host "limpio" para mostrar como fuente. */
function prettySource(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl)
    const host = u.hostname.replace(/^www\./, '')
    return host
  } catch {
    return null
  }
}

/** Decodifica entidades HTML básicas en strings extraídos de meta tags. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

/** Busca un meta tag por property o name attribute, devuelve content. */
function findMeta(html: string, key: string): string | null {
  // Caso 1: property="og:title" content="..."
  // Caso 2: name="description" content="..."
  // Ambos órdenes posibles (content antes o después de key).
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
      'i',
    ),
  ]
  for (const pat of patterns) {
    const m = html.match(pat)
    if (m && m[1]) return decodeEntities(m[1].trim())
  }
  return null
}

function findTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (m && m[1]) return decodeEntities(m[1].trim())
  return null
}

export default withObservability('momentos-url-preview', async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }
  const url = new URL(req.url).searchParams.get('url')?.trim()
  if (!url) {
    return new Response('Falta el parámetro url', { status: 400 })
  }
  // Validar que sea una URL absoluta http/https — bloquear file://, etc.
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return new Response('URL inválida', { status: 400 })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return new Response('Solo http(s)', { status: 400 })
  }

  const source = prettySource(url)

  // Twitter / X bloquean bots — atajo: devolvemos source y dejamos a la UI
  // que el usuario llene el resto manualmente.
  const host = parsed.hostname.replace(/^www\./, '')
  if (host === 'twitter.com' || host === 'x.com') {
    return Response.json({
      ...emptyPreview(url, source),
      source: 'Twitter',
    } satisfies Preview)
  }

  // Fetch con timeout.
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let html = ''
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; TramaBot/1.0; +https://trama.app/bot)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    if (!r.ok) {
      return Response.json(emptyPreview(url, source))
    }
    const ct = r.headers.get('content-type') ?? ''
    if (!ct.includes('text/html')) {
      // PDF / imagen / etc — no podemos extraer meta.
      return Response.json(emptyPreview(url, source))
    }
    // Leer con limit explícito.
    const reader = r.body?.getReader()
    if (!reader) return Response.json(emptyPreview(url, source))
    const chunks: Uint8Array[] = []
    let total = 0
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.byteLength
    }
    reader.cancel().catch(() => {})
    html = new TextDecoder('utf-8', { fatal: false }).decode(
      new Uint8Array(
        chunks.reduce<number[]>((acc, c) => {
          acc.push(...c)
          return acc
        }, []),
      ),
    )
  } catch {
    return Response.json(emptyPreview(url, source))
  } finally {
    clearTimeout(t)
  }

  if (!html) return Response.json(emptyPreview(url, source))

  // Solo miramos el <head> — ahí viven los meta tags.
  const headMatch = html.match(/<head[\s\S]*?<\/head>/i)
  const head = headMatch ? headMatch[0] : html.slice(0, 16 * 1024)

  const ogTitle = findMeta(head, 'og:title')
  const twTitle = findMeta(head, 'twitter:title')
  const docTitle = findTitle(head)
  const title = ogTitle || twTitle || docTitle

  const ogDescription =
    findMeta(head, 'og:description') ||
    findMeta(head, 'twitter:description') ||
    findMeta(head, 'description')

  const ogImage = findMeta(head, 'og:image') || findMeta(head, 'twitter:image')

  const ogSiteName = findMeta(head, 'og:site_name')
  const author =
    findMeta(head, 'article:author') ||
    findMeta(head, 'author') ||
    findMeta(head, 'twitter:creator')

  const preview: Preview = {
    url,
    title: title ?? null,
    description: ogDescription ?? null,
    source: ogSiteName ?? source,
    author: author ?? null,
    image: ogImage ?? null,
    fetched: Boolean(title || ogDescription),
  }
  return Response.json(preview)
})

export const config: Config = {
  path: '/api/momentos/url-preview',
}
