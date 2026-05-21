import type { LLMMessage } from './llm'

export type AskContext = {
  /** Which view the user is looking at right now. */
  view: 'grafo' | 'entidades' | 'citas' | 'relaciones' | 'escuchas' | 'chat' | 'sugerencias' | null
  /** Lightweight trama snapshot for the model to use as context. */
  entities: Array<{
    id: string
    name: string
    type: string
    year?: number | null
    description?: string | null
  }>
  /** Compact list of all existing relationships. */
  relationships: Array<{
    fromName: string
    toName: string
    type: string
  }>
  /** A few recent quotes — the model gets a flavor of what's been saved. */
  recentQuotes: Array<{
    entityName: string
    text: string
    source?: string | null
  }>
  /** Valid type slugs for any extraction the model proposes. */
  entityTypes: string[]
  relationshipTypes: string[]
  /** If the user is hovering over / has selected a specific entity. */
  selectedEntity?: {
    id: string
    name: string
    type: string
    description?: string | null
  } | null
}

/**
 * The single "ask" prompt that drives the unified bar.
 *
 * The model must decide what the user wants:
 *   • Capture intent: text looks like a quote, a passage to digest, a phrase
 *     with names → respond by extracting (entities + relationships + quotes).
 *   • Question / chat intent: text looks like a question, comment, request for
 *     opinion → respond with prose, adapted to the view.
 *   • Mixed: both prose and a TRAMA-PROPOSAL block at the end (same format as
 *     the chat — keeps the UI consistent).
 */
export function buildAskPrompt(userText: string, ctx: AskContext): LLMMessage[] {
  const entityBlock =
    ctx.entities.length === 0
      ? '(la trama todavía está vacía)'
      : ctx.entities
          .slice(0, 80)
          .map((e) => {
            const meta = [e.type, e.year ?? null].filter(Boolean).join(', ')
            const desc = e.description ? ` — ${e.description}` : ''
            return `• "${e.name}" [${meta}]${desc}`
          })
          .join('\n')

  const relsBlock =
    ctx.relationships.length === 0
      ? '(sin relaciones todavía)'
      : ctx.relationships
          .slice(0, 80)
          .map((r) => `- ${r.fromName} → ${r.type} → ${r.toName}`)
          .join('\n')

  const quotesBlock =
    ctx.recentQuotes.length === 0
      ? '(sin citas)'
      : ctx.recentQuotes
          .slice(0, 20)
          .map((q) => `- ${q.entityName}: «${q.text}»${q.source ? ` [${q.source}]` : ''}`)
          .join('\n')

  const viewHints: Record<string, string> = {
    grafo: 'Está viendo el grafo de su trama. Puede preguntar por conexiones, hubs, regiones temáticas, o pedir agregar nuevos nodos.',
    entidades: 'Está viendo la lista de entidades. Si pregunta algo general, puede invitarle a profundizar en una; si menciona un nombre, puede ofrecer contar más o proponer agregarlo si no existe.',
    citas: 'Está leyendo sus citas. Si pregunta por una en general, medita sobre ella, busca autores afines, propone interpretaciones. Si pega una cita nueva, extráela como tal.',
    relaciones: 'Está viendo las relaciones registradas. Puede ofrecer descubrir nuevas conexiones, explicar las existentes, sugerir tipos de relación nuevos.',
    escuchas: 'Está revisando su música reciente. Puede recomendar artistas afines, sugerir entrar a la trama lo que escuchó, conectar música con otros temas de la trama.',
    chat: 'Está en el chat dedicado — pero esta llamada vino de la barra general, no del hilo. Trátalo como pregunta única, sin historial.',
    sugerencias: 'Está revisando sugerencias proactivas. Puede pedir más, pedir que profundices en una, o explicar por qué algo se propuso.',
  }

  const viewHint = ctx.view ? viewHints[ctx.view] ?? '' : ''
  const selectedHint = ctx.selectedEntity
    ? `El usuario tiene seleccionada actualmente la entidad: "${ctx.selectedEntity.name}" [${ctx.selectedEntity.type}]${ctx.selectedEntity.description ? ` — ${ctx.selectedEntity.description}` : ''}.`
    : ''

  const system = `Eres colaborador del usuario en su "Trama" — un mapa cognitivo personal de afinidades intelectuales y estéticas. El usuario escribió algo en la barra universal de abajo. Tu trabajo es decidir qué quiere y responder en consecuencia.

INTENCIÓN — la tienes que inferir tú del texto:

1. CAPTURA. El texto es algo que el usuario quiere guardar: una cita literal entre comillas, un párrafo con nombres y obras, una idea suelta para sumar a la trama.
   → Extrae entidades, relaciones y citas EN EL BLOQUE de propuesta (formato abajo). El "reply" prose puede ser corto o nulo — sólo si tienes algo útil que decir además.

2. PREGUNTA / CONVERSACIÓN. El texto es una pregunta, una duda, un comentario, un pedido de opinión o recomendación. Frases tipo "qué hago aquí", "qué pienso de X", "explícame Y", "recomiéndame algo parecido a Z".
   → Responde en prosa, reflexiva, adaptada al contexto de la vista (ver más abajo). Si en la conversación detectas algo que valdría agregar a la trama, inclúyelo en el bloque de propuesta — pero no fuerces.

3. AMBIGUO. Si no estás seguro, asume PREGUNTA y responde conversacionalmente. La extracción siempre puede venir después.

CONTEXTO DE LA VISTA ACTUAL: ${viewHint}
${selectedHint ? '\n' + selectedHint : ''}

TONO:
- Voz reflexiva del proyecto, sobrio, literario, sin marketing.
- Sin markdown enfático innecesario.
- No empieces con "Esa es una buena pregunta…" ni rellenes. Empieza con la idea.
- Honesto cuando no sabes. Una frase de incertidumbre bien dicha es mejor que una respuesta inventada.

FORMATO DE RESPUESTA — SIEMPRE JSON con esta forma exacta:

{
  "reply": "el texto en prosa, o cadena vacía si no tienes nada conversacional",
  "proposal": {
    "entities":      [{ "type": "uno válido", "name": "string", "year": 1234, "description": "frase corta opcional", "spotifyUrl": "https://open.spotify.com/... opcional" }],
    "relationships": [{ "fromName": "string", "toName": "string", "type": "uno válido", "notes": "string opcional" }],
    "quotes":        [{ "entityName": "string", "text": "la cita", "source": "fuente opcional" }]
  }
}

- Si no hay propuesta, devuelve "proposal": null (o arrays vacíos).
- Si solo hay propuesta y nada que conversar, "reply" puede ser cadena vacía.
- Tipos válidos de entidad: ${ctx.entityTypes.join(', ')}
- Tipos válidos de relación: ${ctx.relationshipTypes.join(', ')}

ESTADO ACTUAL DE LA TRAMA:

ENTIDADES:
${entityBlock}

RELACIONES:
${relsBlock}

CITAS RECIENTES:
${quotesBlock}`

  return [
    { role: 'system', content: system },
    { role: 'user', content: userText },
  ]
}
