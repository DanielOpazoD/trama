import type { LLMMessage } from './llm.js'

/**
 * Sugerencia de curaduría para un recorte: dada la captura (texto +
 * fuente) y las entidades que ya viven en la trama, la IA propone QUÉ
 * debería ser el recorte (cita / entidad / momento), un título corto, una
 * razón breve, y a qué entidades existentes se conecta. Es ADVISORY: el
 * usuario revisa y decide en el modal de promoción; nada se muta acá.
 */

export type EntityLite = { id: string; name: string; type: string }

export type RecorteSuggestion = {
  target: 'quote' | 'entity' | 'momento'
  title: string
  rationale: string
  relatedEntityIds: string[]
  suggestedEntityName: string | null
  suggestedEntityType: string | null
}

export function buildRecorteSuggestPrompt(
  text: string,
  source: { title: string | null; url: string | null; author: string | null },
  entities: EntityLite[],
  entityTypes: string[],
): LLMMessage[] {
  const entityList = entities
    .slice(0, 200)
    .map((e) => `- ${e.id} :: ${e.name} (${e.type})`)
    .join('\n')

  const system = `Eres el curador de "Trama", un mapa cognitivo personal. El usuario
guardó un recorte de la web y hay que sugerir cómo incorporarlo. Tres
destinos posibles:
- "quote": es una CITA — una frase memorable atribuible a un autor u obra.
- "entity": describe una PERSONA, OBRA o CONCEPTO que merece ser un nodo.
- "momento": una nota/recorte del día sin estructura fuerte (lo más común
  cuando no es una frase citable ni una entidad clara).

Devuelve SOLO un objeto JSON con esta forma exacta:
{
  "target": "quote" | "entity" | "momento",
  "title": string (máx 8 palabras, sin comillas),
  "rationale": string (una frase breve, en español, por qué ese destino),
  "relatedEntityIds": string[] (ids de la lista de ENTIDADES EXISTENTES que
     se conectan con el recorte; [] si ninguna; NUNCA inventes ids),
  "suggestedEntityName": string | null (si target="entity", el nombre),
  "suggestedEntityType": string | null (si target="entity", uno de los TIPOS)
}
No agregues texto fuera del JSON.`

  const tiposValidos = entityTypes.length > 0 ? entityTypes.join(', ') : '(libres)'
  const fuente = [source.title, source.author, source.url].filter(Boolean).join(' · ')

  const user = `RECORTE:
"""
${text.slice(0, 4000)}
"""
FUENTE: ${fuente || '(sin datos)'}

TIPOS DE ENTIDAD VÁLIDOS: ${tiposValidos}

ENTIDADES EXISTENTES (id :: nombre (tipo)):
${entityList || '(la trama todavía no tiene entidades)'}`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/**
 * Sanea la respuesta cruda del modelo a una sugerencia segura: target
 * válido, ids existentes (descarta inventados), tipo válido, strings
 * recortados. Nunca lanza — ante basura, cae a un momento sin relaciones.
 */
export function sanitizeSuggestion(
  raw: unknown,
  validEntityIds: Set<string>,
  validTypes: Set<string>,
): RecorteSuggestion {
  const o = (raw ?? {}) as Record<string, unknown>
  const target =
    o.target === 'quote' || o.target === 'entity' || o.target === 'momento'
      ? o.target
      : 'momento'
  const title = typeof o.title === 'string' ? o.title.trim().slice(0, 80) : ''
  const rationale =
    typeof o.rationale === 'string' ? o.rationale.trim().slice(0, 240) : ''
  const relatedEntityIds = Array.isArray(o.relatedEntityIds)
    ? o.relatedEntityIds
        .filter((id): id is string => typeof id === 'string' && validEntityIds.has(id))
        .slice(0, 8)
    : []
  const suggestedEntityName =
    target === 'entity' && typeof o.suggestedEntityName === 'string'
      ? o.suggestedEntityName.trim().slice(0, 120) || null
      : null
  const rawType =
    target === 'entity' && typeof o.suggestedEntityType === 'string'
      ? o.suggestedEntityType.trim()
      : null
  const suggestedEntityType =
    rawType && (validTypes.size === 0 || validTypes.has(rawType)) ? rawType : null
  return {
    target,
    title,
    rationale,
    relatedEntityIds,
    suggestedEntityName,
    suggestedEntityType,
  }
}
