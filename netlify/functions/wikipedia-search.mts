import type { Config } from '@netlify/functions'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'

/**
 * GET /api/wikipedia/search?q=<texto>&lang=es
 *
 * Proxy liviano a la MediaWiki REST API para resolver el artículo de Wikipedia
 * que mejor matchea una entidad. Server-side por dos razones: setear el
 * User-Agent que Wikipedia exige y evitar CORS desde el browser.
 *
 * No toca la DB ni datos de usuario — es una búsqueda pública. Devuelve los
 * candidatos; el usuario elige/confirma en la UI (el match por nombre es
 * ambiguo: "Borges" acierta, "El laberinto" no).
 */

type WikiResult = { title: string; url: string; description: string | null }

// Wikipedia pide un User-Agent descriptivo (con forma de contacto).
const USER_AGENT = 'Trama/0.11 (mapa cognitivo personal; https://github.com/DanielOpazoD/trama)'

export default withObservability('wikipedia-search', async (req, _ctx, { requestId }) => {
  if (req.method !== 'GET') return ApiErrors.methodNotAllowed(requestId)

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  if (!q) return ApiErrors.validation(requestId, 'q requerido')

  // lang saneado a un código ISO simple — va dentro del hostname, así que un
  // valor libre permitiría SSRF. Allowlist por forma; default español.
  const langParam = url.searchParams.get('lang')?.toLowerCase() ?? 'es'
  const lang = /^[a-z]{2,3}$/.test(langParam) ? langParam : 'es'

  const endpoint = `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=5`

  try {
    const res = await fetch(endpoint, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    })
    if (!res.ok) {
      return ApiErrors.upstream(requestId, `Wikipedia respondió ${res.status}`)
    }
    const data = (await res.json()) as {
      pages?: Array<{ key?: string; title?: string; description?: string | null }>
    }
    const results: WikiResult[] = (data.pages ?? [])
      .filter((p) => p.key && p.title)
      .map((p) => ({
        title: p.title as string,
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.key as string)}`,
        description: p.description ?? null,
      }))
    return Response.json({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return ApiErrors.upstream(requestId, `Error consultando Wikipedia: ${message}`)
  }
})

export const config: Config = {
  path: '/api/wikipedia/search',
}
