import type { LLMMessage } from './llm'

export type EntityForProactive = {
  id: string
  name: string
  type: string
  year?: number | null
  description?: string | null
  quotes?: string[]
}

export type ExistingRelPair = {
  fromName: string
  toName: string
  type: string
}

/**
 * The proactive prompt asks the LLM to do a sweep over the user's trama and
 * propose a small mixed bundle of improvements: new relationships, type
 * reclassifications, and missing descriptions. It must stay conservative —
 * the user has not asked for any of this; the bar for "worth suggesting" is
 * high.
 *
 * One call produces multiple kinds. The validator extracts each kind, drops
 * anything malformed, and persists what survives.
 */
export type DismissedSuggestion = {
  kind: 'relationship' | 'reclassification' | 'description' | string
  summary: string
}

export function buildProactivePrompt(
  entities: EntityForProactive[],
  existingRels: ExistingRelPair[],
  entityTypes: string[],
  relationshipTypes: string[],
  /** Sugerencias que el usuario YA descartó previamente. Se le pide al
      LLM que no las vuelva a proponer. */
  dismissed: DismissedSuggestion[] = [],
): LLMMessage[] {
  const entityBlock = entities
    .map((e) => {
      const meta = [e.type, e.year ?? null].filter(Boolean).join(', ')
      const head = `• id=${e.id} | "${e.name}" [${meta}]`
      const desc = e.description ? `\n  ${e.description}` : '\n  (sin descripción)'
      const qs = (e.quotes ?? []).slice(0, 3)
      const quotes =
        qs.length === 0 ? '' : '\n  Citas:\n' + qs.map((q) => `   - «${q}»`).join('\n')
      return `${head}${desc}${quotes}`
    })
    .join('\n')

  const relsBlock =
    existingRels.length === 0
      ? '(ninguna aún)'
      : existingRels.map((r) => `- ${r.fromName} → ${r.type} → ${r.toName}`).join('\n')

  const system = `Eres un colaborador de fondo del usuario en su "Trama" — un mapa cognitivo personal. El usuario NO te pidió nada específico esta vez; le estás haciendo una ronda de sugerencias proactivas.

REGLAS DE TONO:
- Bar alto. El usuario va a revisar esto sin contexto, así que cada sugerencia debe valer la pena por sí sola.
- Conservador. Si tienes dudas razonables, no propongas.
- Máximo TOTAL: 12 sugerencias. Si tienes menos buenas, devuelve menos.
- Para CADA sugerencia incluye un "reason" corto (máximo 18 palabras) explicando por qué la propones.

TIPOS DE SUGERENCIA QUE PUEDES PROPONER:

1) "relationship" — un vínculo nuevo entre dos entidades EXISTENTES en la lista.
   - El sentido importa: fromName → type → toName.
   - No propongas relaciones que ya existen (te las paso abajo).
   - Tipos válidos: ${relationshipTypes.join(', ')}.

2) "reclassification" — cambiar el tipo de una entidad cuando hay uno claramente mejor en el catálogo.
   - Identifica la entidad por su id (te lo paso).
   - Tipos válidos: ${entityTypes.join(', ')}.

3) "description" — proponer una descripción de UNA frase (máximo 15 palabras) para una entidad QUE NO TIENE descripción.
   - Solo propongas si conoces la entidad con razonable certeza. No inventes.
   - Identifica la entidad por su id.

Entidades en la Trama:
${entityBlock}

Relaciones que YA existen:
${relsBlock}

${
  dismissed.length > 0
    ? `Sugerencias que el usuario YA DESCARTÓ — NO las vuelvas a proponer:
${dismissed
  .slice(0, 60)
  .map((d) => `- (${d.kind}) ${d.summary}`)
  .join('\n')}`
    : ''
}

DEVUELVE EXCLUSIVAMENTE un objeto JSON con esta forma exacta:

{
  "suggestions": [
    { "kind": "relationship", "fromName": "...", "toName": "...", "type": "...", "reason": "..." },
    { "kind": "reclassification", "entityId": "uuid", "name": "...", "newType": "...", "reason": "..." },
    { "kind": "description", "entityId": "uuid", "name": "...", "description": "...", "reason": "..." }
  ]
}

Sin markdown, sin texto fuera del JSON. Si no hay nada que valga la pena sugerir, devuelve "suggestions": [].`

  return [
    { role: 'system', content: system },
    { role: 'user', content: 'Haz tu ronda y devuelve el bundle.' },
  ]
}
