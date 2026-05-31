import type { Config } from '@netlify/functions'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { sanitizeLang, searchWikipedia } from './_lib/wikipedia.js'
import { getAuthedUser } from './_lib/auth.js'

/**
 * GET /api/wikipedia/search?q=<texto>&lang=es
 *
 * Proxy a la MediaWiki REST API para resolver el artículo de Wikipedia que
 * mejor matchea una entidad. Devuelve los candidatos; el usuario elige/confirma
 * (el match por nombre es ambiguo). La lógica vive en `_lib/wikipedia.ts`.
 */
export default withObservability('wikipedia-search', async (req, _ctx, { requestId }) => {
  if (req.method !== 'GET') return ApiErrors.methodNotAllowed(requestId)
  await getAuthedUser(req)

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  if (!q) return ApiErrors.validation(requestId, 'q requerido')

  const lang = sanitizeLang(url.searchParams.get('lang'))
  try {
    const results = await searchWikipedia(q, lang)
    return Response.json({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return ApiErrors.upstream(requestId, `Error consultando Wikipedia: ${message}`)
  }
})

export const config: Config = {
  path: '/api/wikipedia/search',
}
