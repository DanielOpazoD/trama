import { askLLMForText } from './llm.js'

/**
 * Busca si existe una entrada relevante en Grokipedia (grokipedia.com)
 * para una entidad que el usuario acaba de crear.
 *
 * Implementa "Opción C" (híbrida, barata y confiable):
 *  1. Intento directo: slugifica el nombre y hace HEAD a https://grokipedia.com/<slug>
 *  2. Si el HEAD no confirma existencia → fallback a LLM (el modelo usa su
 *     conocimiento para sugerir URL existente si la hay; nunca inventa).
 *
 * Nunca genera contenido nuevo. Solo devuelve URL o null.
 * Se llama de forma no bloqueante (fire-and-forget) tras crear la entidad.
 */
export async function findGrokipediaUrl(
  name: string,
  type: string,
): Promise<string | null> {
  // Slugificación simple y robusta (sin acentos, solo caracteres URL-safe)
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!slug) return null

  const candidate = `https://grokipedia.com/${slug}`

  // Paso 1: HEAD request (rápido, sin costo de LLM)
  try {
    const res = await fetch(candidate, { method: 'HEAD' })
    // 2xx OK o redirect 3xx (a veces el sitio redirige a la forma canónica)
    if (res.ok || (res.status >= 300 && res.status < 400)) {
      return candidate
    }
  } catch {
    // Error de red/timeout/CORS/etc. → continuamos al fallback LLM
  }

  // Paso 2: Fallback LLM (solo conocimiento, sin invención)
  const system = `Eres un buscador preciso de entradas de Grokipedia.
Responde únicamente con:
- La URL completa https://grokipedia.com/... de la mejor entrada existente, si estás bastante seguro de que existe y es relevante, o
- La palabra exacta "null" (sin comillas ni nada más) si no hay entrada de calidad.

Nunca inventes URLs. Si no estás seguro, responde "null".`

  const user = `Entidad recién creada en un mapa cognitivo personal:
Nombre: ${name}
Tipo: ${type}

¿Existe una entrada de Grokipedia para esto? Devuelve solo la URL o "null".`

  try {
    const result = await askLLMForText([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ])

    const text = typeof result.content === 'string' ? result.content.trim() : ''
    if (!text || text.toLowerCase() === 'null') return null

    if (text.startsWith('https://grokipedia.com/') && text.length < 300) {
      return text
    }
    return null
  } catch {
    return null
  }
}
