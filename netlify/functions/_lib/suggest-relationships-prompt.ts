import type { LLMMessage } from './llm'

export type EntityForSuggest = {
  id: string
  name: string
  type: string
  year?: number | null
  description?: string | null
  quotes?: string[]
}

export type ExistingRelationshipPair = {
  fromName: string
  toName: string
  type: string
}

/**
 * Build a prompt asking the LLM to propose NEW relationships between
 * ALREADY-EXISTING entities. The LLM must not invent new entities or quotes.
 *
 * We feed it: every entity (name, type, year, description, up to 5 quotes per
 * entity) and the set of relationships that already exist, so it can avoid
 * duplicates.
 */
export function buildSuggestRelationshipsPrompt(
  entities: EntityForSuggest[],
  existing: ExistingRelationshipPair[],
  relationshipTypes: string[],
  /**
   * η2: proposals que el usuario descartó en runs anteriores. Las
   * incluimos en el prompt como "no las repitas" para que la IA
   * proponga COSAS DIFERENTES, no las mismas con otra justificación.
   */
  avoidPrevious: ExistingRelationshipPair[] = [],
): LLMMessage[] {
  const entityBlock = entities
    .map((e) => {
      const meta = [e.type, e.year ?? null].filter(Boolean).join(', ')
      const head = `• ${e.name} [${meta}]`
      const desc = e.description ? `\n  ${e.description}` : ''
      const qs = (e.quotes ?? []).slice(0, 5)
      const quotes =
        qs.length === 0 ? '' : '\n  Citas:\n' + qs.map((q) => `   - «${q}»`).join('\n')
      return `${head}${desc}${quotes}`
    })
    .join('\n')

  const existingBlock =
    existing.length === 0
      ? '(ninguna aún)'
      : existing.map((r) => `- ${r.fromName} → ${r.type} → ${r.toName}`).join('\n')

  const avoidBlock =
    avoidPrevious.length === 0
      ? ''
      : '\n\nDESCARTADAS por el usuario en intentos anteriores — NO las propongas de nuevo (busca relaciones genuinamente distintas):\n' +
        avoidPrevious.map((r) => `- ${r.fromName} → ${r.type} → ${r.toName}`).join('\n')

  const system = `Eres un asistente que enriquece la "Trama" del usuario: un mapa cognitivo personal de afinidades intelectuales y estéticas.

El usuario ya tiene una lista de entidades (personas, libros, conceptos, álbumes, etc.) cada una con su descripción y, a veces, citas que las acompañan. También tiene relaciones ya registradas entre ellas.

Tu trabajo: PROPONER NUEVAS RELACIONES entre las entidades existentes basándote en su descripción, sus citas y el conocimiento general.

REGLAS ESTRICTAS:
- SOLO puedes proponer relaciones entre entidades de la lista. No inventes entidades nuevas.
- NO repitas relaciones que ya existen (te las paso explícitamente).
- Las relaciones son dirigidas: fromName → toName. El orden importa.
- Sé conservador: solo propón relaciones que tengan justificación real. Es preferible proponer pocas y buenas a muchas y dudosas.
- Para cada relación, escribe en "notes" UNA frase corta (máximo 20 palabras) que explique POR QUÉ la propones. No copies citas literales; resume la justificación.
- Tipos válidos de relación: ${relationshipTypes.join(', ')}
- Si no encuentras ninguna relación razonable, devuelve "relationships": [].

Entidades en la Trama del usuario:
${entityBlock}

Relaciones que YA existen (no las repitas):
${existingBlock}${avoidBlock}

DEVUELVE EXCLUSIVAMENTE un objeto JSON con esta forma exacta:

{
  "relationships": [
    { "fromName": "string", "toName": "string", "type": "uno de los tipos válidos", "notes": "justificación breve" }
  ]
}

Sin comentarios, sin markdown, solo el JSON.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: 'Propón las relaciones que falten.' },
  ]
}
