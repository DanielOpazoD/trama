import type { LLMMessage } from '../llm.js'
import type { CaptureIntent } from './types.js'
import { slugifyEntityType } from './entity-type.js'

/**
 * Camino LLM del híbrido: cuando el mensaje NO trae prefijo, le pedimos al
 * modelo que clasifique en una de las cuatro escrituras y extraiga sus
 * campos. El prompt es deliberadamente conservador — ante la duda, "note"
 * (lo más barato de deshacer) — y devuelve JSON estricto que validamos antes
 * de tocar la base. Mismo patrón que `extract.mts`: prompt puro acá, la
 * llamada y el cost-cap viven en el handler.
 */

const SYSTEM = `Sos el clasificador de captura de Trama, una app de conocimiento personal.
Recibís un mensaje de WhatsApp y decidís en cuál de estas cuatro cosas se guarda:

- "note": un apunte rápido, idea, recordatorio o reflexión suelta. Es el DEFAULT ante la duda.
- "quote": una cita literaria/frase con un autor identificable. Solo si hay un autor claro.
- "entity": algo para agregar al grafo de conocimiento (una persona, libro, obra, concepto, lugar) presentado como "agregá X" o un nombre propio aislado con su tipo.
- "momento": una memoria fechada del día, algo vivido ("hoy fui...", "me acordé de...", una foto descrita, un evento personal).

Respondé SOLO con un objeto JSON, sin texto alrededor, con esta forma:
{
  "kind": "note" | "quote" | "entity" | "momento",
  "note": { "content": string },                                  // si kind=note
  "quote": { "text": string, "author": string },                  // si kind=quote
  "entity": { "name": string, "type": string, "description": string | null }, // si kind=entity
  "momento": { "bodyText": string }                               // si kind=momento
}
Incluí SOLO la clave que corresponde a "kind". Para entity, "type" es un slug en minúsculas (persona, libro, concepto, lugar, obra, evento, musico, pelicula...). Si no estás seguro del tipo, usá "concepto".`

export function buildClassifyPrompt(text: string): LLMMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: text },
  ]
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Valida y normaliza la salida del LLM a una CaptureIntent, o null si vino
 * inservible (entonces el handler cae a guardar el texto crudo como nota).
 */
export function validateClassification(raw: unknown): CaptureIntent | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const kind = asString(obj.kind)

  if (kind === 'note') {
    const content = asString((obj.note as Record<string, unknown>)?.content)
    return content ? { kind: 'note', content } : null
  }
  if (kind === 'quote') {
    const q = (obj.quote as Record<string, unknown>) ?? {}
    const text = asString(q.text)
    const author = asString(q.author)
    return text ? { kind: 'quote', text, author } : null
  }
  if (kind === 'entity') {
    const e = (obj.entity as Record<string, unknown>) ?? {}
    const name = asString(e.name)
    const type = slugifyEntityType(asString(e.type))
    const description = asString(e.description) || null
    return name ? { kind: 'entity', name, entityType: type, description } : null
  }
  if (kind === 'momento') {
    const bodyText = asString((obj.momento as Record<string, unknown>)?.bodyText)
    return bodyText ? { kind: 'momento', bodyText } : null
  }
  return null
}
