import type { Config } from '@netlify/functions'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { findMeta, findTitle, prettySource } from './_lib/og-parse.js'
import { getAuthedUser } from './_lib/auth.js'

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
const MAX_REDIRECTS = 5

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

function isBlockedIPv4(address: string): boolean {
  const parts = address.split('.').map((p) => Number.parseInt(p, 10))
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true
  }
  const [a, b] = parts as [number, number, number, number]
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function isBlockedIPv6(address: string): boolean {
  const lower = address.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true
  }
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice('::ffff:'.length)
    return isBlockedIPv4(mapped)
  }
  return false
}

export function isBlockedPreviewAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return isBlockedIPv4(address)
  if (version === 6) return isBlockedIPv6(address)
  return true
}

async function assertPublicHttpUrl(target: URL): Promise<void> {
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('Solo http(s)')
  }
  const hostname = target.hostname.replace(/^\[|\]$/g, '')
  const directIp = isIP(hostname)
  if (directIp && isBlockedPreviewAddress(hostname)) {
    throw new Error('URL privada bloqueada')
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some((addr) => isBlockedPreviewAddress(addr.address))) {
    throw new Error('URL privada bloqueada')
  }
}

export default withObservability('momentos-url-preview', async (req: Request, _ctx, { requestId }) => {
  if (req.method !== 'GET') {
    return ApiErrors.methodNotAllowed(requestId)
  }
  await getAuthedUser(req)
  const url = new URL(req.url).searchParams.get('url')?.trim()
  if (!url) {
    return ApiErrors.validation(requestId, 'Falta el parámetro url')
  }
  // Validar que sea una URL absoluta http/https — bloquear file://, etc.
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return ApiErrors.validation(requestId, 'URL inválida')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return ApiErrors.validation(requestId, 'Solo http(s)')
  }
  try {
    await assertPublicHttpUrl(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'URL privada bloqueada'
    return ApiErrors.validation(requestId, message)
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
    let current = parsed
    let r: Response | null = null
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      await assertPublicHttpUrl(current)
      r = await fetch(current.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; TramaBot/1.0; +https://trama.app/bot)',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'manual',
      })
      if (![301, 302, 303, 307, 308].includes(r.status)) break
      const location = r.headers.get('location')
      if (!location) break
      current = new URL(location, current)
    }
    if (!r) return Response.json(emptyPreview(url, source))
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

// υ-bugfix: mismo conflicto que /api/momentos/upload — `:id` matcheaba
// "url-preview" y devolvía 405. Movido a path sin colisión.
export const config: Config = {
  path: '/api/momentos-url-preview',
}
