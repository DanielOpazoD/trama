import type { LLMMessage } from './llm'
import {
  budgetItems,
  logContextTruncation,
  DEFAULT_CONTEXT_TOKEN_BUDGET,
} from './token-budget.js'
import { stripTramaProposalBlock } from './proposal-markers.js'

export type ChatTramaContext = {
  entities: Array<{
    id: string
    name: string
    type: string
    year?: number | null
    description?: string | null
  }>
  relationships: Array<{
    id: string
    fromName: string
    toName: string
    type: string
    notes?: string | null
  }>
  quotes: Array<{
    id: string
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
  /** If present, the thread is focused on a single entity. The system prompt
      shifts to "conversación con X" tone and the trama context shown is
      already filtered to that entity + neighbors. */
  focusEntity?: { id: string; name: string; type: string } | null,
): LLMMessage[] {
  // Each row includes its UUID so the model can reference it in edits and
  // deletes. IDs are noisy but unavoidable — name alone is ambiguous.
  //
  // El contexto ya viene acotado por RAG aguas arriba, pero igual lo pasamos por
  // un presupuesto de tokens como red de seguridad: evita que un hilo con mucho
  // contexto trunque en silencio del lado del provider. Reparto: 50/30/20.
  const budget = DEFAULT_CONTEXT_TOKEN_BUDGET
  const ents = budgetItems(
    context.entities,
    (e) => `${e.id}${e.name}${e.type}${e.year ?? ''}${e.description ?? ''}`,
    Math.floor(budget * 0.5),
  )
  const rels = budgetItems(
    context.relationships,
    (r) => `${r.id}${r.fromName}${r.type}${r.toName}${r.notes ?? ''}`,
    Math.floor(budget * 0.3),
  )
  const quos = budgetItems(
    context.quotes,
    (q) => `${q.id}${q.entityName}${q.text}${q.source ?? ''}`,
    Math.floor(budget * 0.2),
  )
  logContextTruncation(
    'chat',
    { entities: ents.dropped, relationships: rels.dropped, quotes: quos.dropped },
    budget,
  )

  const entityBlock =
    context.entities.length === 0
      ? '(la trama todavía está vacía)'
      : ents.items
          .map((e) => {
            const meta = [e.type, e.year ?? null].filter(Boolean).join(', ')
            const desc = e.description ? ` — ${e.description}` : ''
            return `• [id=${e.id}] "${e.name}" [${meta}]${desc}`
          })
          .join('\n')

  const relsBlock =
    context.relationships.length === 0
      ? '(sin relaciones todavía)'
      : rels.items
          .map((r) => {
            const note = r.notes ? ` — ${r.notes}` : ''
            return `- [id=${r.id}] ${r.fromName} → ${r.type} → ${r.toName}${note}`
          })
          .join('\n')

  const quotesBlock =
    context.quotes.length === 0
      ? '(sin citas)'
      : quos.items
          .map((q) => {
            const src = q.source ? ` [${q.source}]` : ''
            return `- [id=${q.id}] ${q.entityName}: «${q.text}»${src}`
          })
          .join('\n')

  const focusPreamble = focusEntity
    ? `Esta conversación está FOCALIZADA en una entidad específica: "${focusEntity.name}" [${focusEntity.type}]. El usuario quiere conversar sobre ELLA en particular — sus citas, sus conexiones, su contexto, lo que se relaciona con ella. El estado de la trama abajo ya viene FILTRADO a esa entidad y sus vecinos directos. Mantén el foco; si el usuario pregunta por algo aparte, puedes responder pero recuérdale que el hilo es sobre ${focusEntity.name}.\n\n`
    : ''

  const system = `${focusPreamble}Eres un colaborador del usuario en su "Trama" — un mapa cognitivo personal de afinidades intelectuales y estéticas (personas, libros, canciones, conceptos, ideas, sus relaciones y citas). Tu rol:

1. Responder preguntas sobre la trama y sobre los temas que ella contiene.
2. Conversar sobre las personas, obras, ideas y citas que el usuario guarda — añadiendo contexto, conexiones culturales, biografía, lecturas posibles.
3. Recomendar música, libros, películas, lecturas, conceptos cuando el usuario los pida o cuando sea natural en la conversación.
4. Cuando el usuario te pregunte o cuando lo amerite, PROPONER agregar elementos a la trama: entidades nuevas, relaciones, citas, o reclasificaciones de entidades existentes.

NUNCA agregues, modifiques ni borres nada sin el consentimiento del usuario. Tus propuestas son sugerencias que la UI mostrará como botones inline.

Si propones entidades MUSICALES (tipo banda, musico, cancion, album, disco) y conoces la URL pública en Spotify (https://open.spotify.com/...), inclúyela en el campo "spotifyUrl". Si no la conoces con certeza, omítela — NO inventes IDs.

FORMATO DE RESPUESTA:

Si tu respuesta es solo conversación, devuelve TEXTO PLANO en español, con la voz reflexiva del proyecto (sobrio, literario, sin marketing). Sin markdown enfático innecesario.

Si tienes propuestas concretas que el usuario podría querer agregar, AL FINAL del texto incluye un bloque JSON exactamente con esta forma, entre marcadores literales:

<<<TRAMA-PROPOSAL
{
  "entities":      [{ "type": "uno de los tipos válidos", "name": "string", "year": 1234, "description": "frase corta opcional", "spotifyUrl": "https://open.spotify.com/... opcional" }],
  "relationships": [{ "fromName": "string", "toName": "string", "type": "uno de los tipos válidos", "notes": "string opcional" }],
  "quotes":        [{ "entityName": "string", "text": "la cita", "source": "fuente opcional" }],
  "reclassifications": [{ "name": "string", "newType": "uno de los tipos válidos", "reason": "por qué" }],
  "edits": [
    { "kind": "entity",       "id": "uuid", "patch": { "name": "...", "type": "...", "year": 1234, "description": "...", "spotifyUrl": "..." }, "reason": "por qué" },
    { "kind": "quote",        "id": "uuid", "patch": { "text": "...", "source": "...", "context": "...", "entityId": "uuid-de-otra-entidad", "userReflection": "..." }, "reason": "..." },
    { "kind": "relationship", "id": "uuid", "patch": { "type": "...", "notes": "..." }, "reason": "..." }
  ],
  "deletes": [
    { "kind": "entity",       "id": "uuid", "reason": "duplicada de X" },
    { "kind": "quote",        "id": "uuid", "reason": "..." },
    { "kind": "relationship", "id": "uuid", "reason": "..." }
  ]
}
TRAMA-PROPOSAL>>>

- Arrays pueden ser vacíos. Omite el bloque entero si no hay nada que proponer.
- Para EDITS y DELETES, el "id" debe coincidir EXACTAMENTE con un id que te pasé arriba en el estado de la trama. NUNCA inventes IDs.
- En "edits", incluye en "patch" SOLO los campos que cambian. Los demás se preservan.
- Propón "deletes" únicamente cuando el usuario lo pida explícitamente o cuando detectes duplicados claros. El usuario debe aprobar los borrados de forma opt-in — sé conservador.
- Para reclassifications (forma legacy), "name" debe coincidir con una entidad existente; equivalente a un edit de tipo entidad con patch.type.
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
    messages.push({
      role: turn.role,
      content:
        turn.role === 'assistant' ? stripTramaProposalBlock(turn.content) : turn.content,
    })
  }
  return messages
}

/**
 * Título de hilo derivado de la primera pregunta — truncado TIPOGRÁFICO,
 * sin llamada al LLM. La pregunta del usuario ya es el mejor título; un
 * resumen generado agrega latencia, costo y una voz que no es la suya.
 * Corta en límite de palabra (~56 chars) y cierra con elipsis.
 */
export function deriveThreadTitle(firstUserMessage: string): string {
  const MAX = 56
  const flat = firstUserMessage.replace(/\s+/g, ' ').trim()
  if (flat.length <= MAX) return flat
  const cut = flat.slice(0, MAX + 1)
  const lastSpace = cut.lastIndexOf(' ')
  // Si la última palabra es interminable (sin espacios útiles), corte duro.
  const head = lastSpace > 24 ? cut.slice(0, lastSpace) : cut.slice(0, MAX)
  return `${head.replace(/[\s,.;:¡!¿?—–-]+$/, '')}…`
}
