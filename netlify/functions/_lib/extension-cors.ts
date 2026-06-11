/**
 * CORS para la extensión de Chrome: los endpoints de captura responden a
 * orígenes `chrome-extension://` (y moz-extension, por si acaso). Solo se
 * habilita en los endpoints que la extensión usa — no es CORS global.
 */

const EXTENSION_ORIGIN = /^(chrome|moz)-extension:\/\//

export function extensionCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  if (!EXTENSION_ORIGIN.test(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/** Respuesta al preflight OPTIONS; null si no es un preflight de extensión. */
export function extensionPreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null
  const headers = extensionCorsHeaders(req)
  if (Object.keys(headers).length === 0) return null
  return new Response(null, { status: 204, headers })
}

/** Copia una respuesta agregando los headers CORS de extensión (si aplican). */
export function withExtensionCors(req: Request, res: Response): Response {
  const headers = extensionCorsHeaders(req)
  if (Object.keys(headers).length === 0) return res
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v)
  return out
}
