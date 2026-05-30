import { askLLMForText } from './llm'

/**
 * Busca una entrada de Grokipedia para una entidad.
 * Opción C (híbrida):
 * 1. Intento simple: construye URL probable y verifica con HEAD.
 * 2. Si falla o no es confiable → fallback a LLM (Grok preferentemente).
 */
export async function findGrokipediaUrl(
  name: string,
  type: string
): Promise<string | null> {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  // Paso 1: Intento simple y barato
  const candidate = `https://grokipedia.com/${slug}`
  try {
    const res = await fetch(candidate, { method: 'HEAD' })
    if (res.ok) {
      return candidate
    }
  } catch {
    // ignorar errores de red
  }

  // Paso 2: Fallback a LLM
  const prompt = `El usuario acaba de crear una entidad en su mapa cognitivo personal "Trama".

Nombre: "${name}"
Tipo: "${type}"

Busca si existe una entrada de alta calidad en Grokipedia (grokipedia.com) para este tema.

Devuelve SOLO la URL completa de la mejor entrada si estás razonablemente seguro de que existe y es relevante.
Si no hay una buena coincidencia, responde exactamente: null

No inventes URLs.`

  try {
    const result = await askLLMForText(
      [{ role: 'user', content: prompt }],
      { provider: 'grok' } // intenta usar Grok si está disponible
    )

    const url = result.trim()
    if (url.startsWith('https://grokipedia.com/') && url.length < 250) {
      return url
    }
    return null
  } catch {
    return null
  }
}
