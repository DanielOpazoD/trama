import type { LLMMessage } from './llm'

export type ChatTramaContext = {
  entities: Array<{
    id: string
    name: string
    type: string
    year?: number | null
    description?: string | null
  }>
  relationships: Array<{
    fromName: string
    toName: string
    type: string
    notes?: string | null
  }>
  quotes: Array<{
    entityName: string
    text: string
    source?: string | null
  }>
}

export type ChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Build the messages for a chat turn. The system prompt teaches the model the
 * format we expect and provides a compact dump of the user's trama as context.
 *
 * The model can reply with plain prose, or — when the user's message warrants
 * action — append a fenced JSON block that the validator will lift into
 * `proposals`. Two-channel format keeps the conversation readable while
 * letting the UI offer one-click "add to trama" buttons.
 */
export function buildChatPrompt(
  history: ChatTurn[],
  context: ChatTramaContext,
  relationshipTypes: string[],
  entityTypes: string[],
): LLMMessage[] {
  const entityBlock =
    context.entities.length === 0
      ? '(la trama todavía está vacía)'
      : context.entities
          .map((e) => {
            const meta = [e.type, e.year ?? null].filter(Boolean).join(', ')
            const desc = e.description ? ` — ${e.description}` : ''
            return `• "${e.name}" [${meta}]${desc}`
          })
          .join('\n')

  const relsBlock =
    context.relationships.length === 0
      ? '(sin relaciones todavía)'
      : context.relationships
          .map((r) => {
            const note = r.notes ? ` — ${r.notes}` : ''
            return `- ${r.fromName} → ${r.type} → ${r.toName}${note}`
          })
          .join('\n')

  const quotesBlock =
    context.quotes.length === 0
      ? '(sin citas)'
      : context.quotes
          .map((q) => {
            const src = q.source ? ` [${q.source}]` : ''
            return `- ${q.entityName}: «${q.text}»${src}`
          })
          .join('\n')

  const system = `Eres un colaborador del usuario en su "Trama" — un mapa cognitivo personal de afinidades intelectuales y estéticas (personas, libros, canciones, conceptos, ideas, sus relaciones y citas). Tu rol:

1. Responder preguntas sobre la trama y sobre los temas que ella contiene.
2. Conversar sobre las personas, obras, ideas y citas que el usuario guarda — añadiendo contexto, conexiones culturales, biografía, lecturas posibles.
3. Cuando el usuario te pregunte o cuando lo amerite, PROPONER agregar elementos a la trama: entidades nuevas, relaciones, citas, o reclasificaciones de entidades existentes.

NUNCA agregues, modifiques ni borres nada sin el consentimiento del usuario. Tus propuestas son sugerencias que la UI mostrará como botones inline.

FORMATO DE RESPUESTA:

Si tu respuesta es solo conversación, devuelve TEXTO PLANO en español, con la voz reflexiva del proyecto (sobrio, literario, sin marketing). Sin markdown enfático innecesario.

Si tienes propuestas concretas que el usuario podría querer agregar, AL FINAL del texto incluye un bloque JSON exactamente con esta forma, entre marcadores literales:

<<<TRAMA-PROPOSAL
{
  "entities":      [{ "type": "uno de los tipos válidos", "name": "string", "year": 1234, "description": "frase corta opcional" }],
  "relationships": [{ "fromName": "string", "toName": "string", "type": "uno de los tipos válidos", "notes": "string opcional" }],
  "quotes":        [{ "entityName": "string", "text": "la cita", "source": "fuente opcional" }],
  "reclassifications": [{ "name": "string", "newType": "uno de los tipos válidos", "reason": "por qué" }]
}
TRAMA-PROPOSAL>>>

- Arrays pueden ser vacíos. Omite el bloque entero si no hay nada que proponer.
- Para reclassifications, "name" debe coincidir con una entidad existente.
- Tipos válidos de entidad: ${entityTypes.join(', ')}
- Tipos válidos de relación: ${relationshipTypes.join(', ')}

ESTADO ACTUAL DE LA TRAMA DEL USUARIO:

ENTIDADES:
${entityBlock}

RELACIONES:
${relsBlock}

CITAS:
${quotesBlock}`

  const messages: LLMMessage[] = [{ role: 'system', content: system }]
  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content })
  }
  return messages
}

/**
 * Build a prompt that asks the LLM for a short title for a thread, given the
 * first user message. Used to label threads in the sidebar.
 */
export function buildChatTitlePrompt(firstUserMessage: string): LLMMessage[] {
  return [
    {
      role: 'system',
      content:
        'Genera un título MUY corto (máximo 6 palabras, sin comillas, sin punto final) en español que resuma el tema de este mensaje. Devuelve SOLO el título, sin nada más.',
    },
    { role: 'user', content: firstUserMessage },
  ]
}
