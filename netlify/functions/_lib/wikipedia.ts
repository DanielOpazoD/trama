/**
 * Cliente liviano de la MediaWiki REST API (búsqueda de artículos). Compartido
 * por /api/wikipedia/search (búsqueda puntual) y /api/wikipedia-suggest
 * (sugerencias en lote). Server-side por el User-Agent que Wikipedia exige y
 * para evitar CORS.
 */

import { z } from 'zod'

export type WikiResult = { title: string; url: string; description: string | null }

/**
 * E5 — Schema de la respuesta de la MediaWiki REST API (`/search/page`).
 * Sólo modelamos `pages[]` con los campos que consumimos. `.passthrough()`
 * tolera los extras (thumbnail, id, etc.) que la API agrega. Si el contrato
 * cambia (p.ej. `pages` deja de ser array), el `.parse()` tira y
 * `withObservability` lo loguea en vez de devolver resultados vacíos en
 * silencio.
 */
const WikipediaSearchResponse = z
  .object({
    pages: z
      .array(
        z
          .object({
            key: z.string().optional(),
            title: z.string().optional(),
            description: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough()

// Wikipedia pide un User-Agent descriptivo (con forma de contacto).
const USER_AGENT =
  'Trama/0.11 (mapa cognitivo personal; https://github.com/DanielOpazoD/trama)'

/** `lang` va dentro del hostname → saneado por forma (anti-SSRF). Default es. */
export function sanitizeLang(raw: string | null | undefined): string {
  const l = (raw ?? 'es').toLowerCase()
  return /^[a-z]{2,3}$/.test(l) ? l : 'es'
}

/** Busca artículos en Wikipedia. Lanza si la API responde con error. */
export async function searchWikipedia(q: string, lang = 'es'): Promise<WikiResult[]> {
  const endpoint = `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=5`
  const res = await fetch(endpoint, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Wikipedia respondió ${res.status}`)
  const data = WikipediaSearchResponse.parse(await res.json())
  return (data.pages ?? [])
    .filter((p) => p.key && p.title)
    .map((p) => ({
      title: p.title as string,
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.key as string)}`,
      description: p.description ?? null,
    }))
}
