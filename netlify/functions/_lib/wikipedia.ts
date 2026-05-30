/**
 * Cliente liviano de la MediaWiki REST API (búsqueda de artículos). Compartido
 * por /api/wikipedia/search (búsqueda puntual) y /api/wikipedia-suggest
 * (sugerencias en lote). Server-side por el User-Agent que Wikipedia exige y
 * para evitar CORS.
 */

export type WikiResult = { title: string; url: string; description: string | null }

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
  const data = (await res.json()) as {
    pages?: Array<{ key?: string; title?: string; description?: string | null }>
  }
  return (data.pages ?? [])
    .filter((p) => p.key && p.title)
    .map((p) => ({
      title: p.title as string,
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.key as string)}`,
      description: p.description ?? null,
    }))
}
