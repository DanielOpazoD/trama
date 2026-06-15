import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'

/**
 * Fetch HTTP(s) endurecido contra SSRF, compartido por:
 *   - `momentos-url-preview` (lee los meta OG de una URL externa)
 *   - `recortes-thumbnail-cache` (descarga la miniatura para guardarla en blob)
 *
 * El endurecimiento es doble: (1) resolvemos el hostname por DNS y rechazamos
 * cualquier dirección privada/loopback/link-local/metadata ANTES de conectar, y
 * (2) "pineamos" esa dirección en el socket (`lookup` propio) para que el agente
 * no re-resuelva el hostname a una IP distinta entre el chequeo y el connect
 * (TOCTOU / DNS rebinding). Cada salto de redirect se re-valida.
 */

export type PublicAddress = {
  address: string
  family: 4 | 6
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
  if (
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  ) {
    return true
  }
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice('::ffff:'.length)
    return isBlockedIPv4(mapped)
  }
  return false
}

/** ¿Es una dirección privada/loopback/link-local/metadata (a bloquear)? */
export function isBlockedPreviewAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return isBlockedIPv4(address)
  if (version === 6) return isBlockedIPv6(address)
  return true
}

/**
 * Resuelve un destino http(s) a una dirección pública concreta o lanza si la
 * URL no es http(s) o resuelve a un rango bloqueado.
 */
export async function resolvePublicHttpUrl(target: URL): Promise<PublicAddress> {
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('Solo http(s)')
  }
  const hostname = target.hostname.replace(/^\[|\]$/g, '')
  const directIp = isIP(hostname)
  if (directIp) {
    if (isBlockedPreviewAddress(hostname)) {
      throw new Error('URL privada bloqueada')
    }
    return { address: hostname, family: directIp as 4 | 6 }
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (
    addresses.length === 0 ||
    addresses.some((addr) => isBlockedPreviewAddress(addr.address))
  ) {
    throw new Error('URL privada bloqueada')
  }
  const first = addresses[0]
  if (!first || (first.family !== 4 && first.family !== 6)) {
    throw new Error('URL privada bloqueada')
  }
  return { address: first.address, family: first.family as 4 | 6 }
}

function createPinnedLookup(resolved: PublicAddress) {
  return (
    _hostname: string,
    _options: unknown,
    callback: (err: NodeJS.ErrnoException | null, address: string, family: 4 | 6) => void,
  ) => {
    callback(null, resolved.address, resolved.family)
  }
}

function responseHeadersFromNode(
  headers: Record<string, string | string[] | number | undefined>,
) {
  const out = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) out.append(key, item)
    } else if (value !== undefined) {
      out.set(key, String(value))
    }
  }
  return out
}

/**
 * Hace un GET a `target` con la IP `resolved` pineada en el socket. El header
 * Accept lo decide el caller (HTML para el preview, image/* para la miniatura).
 */
export function fetchWithPinnedLookup(
  target: URL,
  resolved: PublicAddress,
  signal: AbortSignal,
  accept: string,
): Promise<Response> {
  const requestImpl = target.protocol === 'https:' ? httpsRequest : httpRequest

  return new Promise<Response>((resolve, reject) => {
    const req = requestImpl(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TramaBot/1.0; +https://trama.app/bot)',
          Accept: accept,
        },
        lookup: createPinnedLookup(resolved),
        signal,
      },
      (res) => {
        resolve(
          new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, {
            status: res.statusCode ?? 0,
            statusText: res.statusMessage,
            headers: responseHeadersFromNode(res.headers),
          }),
        )
      },
    )
    req.on('error', reject)
    req.end()
  })
}

const REDIRECT_STATUSES = [301, 302, 303, 307, 308]
const DEFAULT_MAX_REDIRECTS = 5

/**
 * GET SSRF-safe que sigue redirects re-validando cada salto contra los rangos
 * bloqueados. Devuelve la primera respuesta no-redirect (o la última si no hubo
 * Location). Lanza si algún salto resuelve a un rango privado.
 */
export async function safeFetchFollowingRedirects(
  start: URL,
  signal: AbortSignal,
  accept: string,
  maxRedirects = DEFAULT_MAX_REDIRECTS,
): Promise<Response | null> {
  let current = start
  let res: Response | null = null
  for (let i = 0; i <= maxRedirects; i += 1) {
    const resolved = await resolvePublicHttpUrl(current)
    res = await fetchWithPinnedLookup(current, resolved, signal, accept)
    if (!REDIRECT_STATUSES.includes(res.status)) break
    const location = res.headers.get('location')
    if (!location) break
    current = new URL(location, current)
  }
  return res
}
