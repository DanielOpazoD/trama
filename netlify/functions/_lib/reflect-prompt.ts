import type { LLMMessage } from './llm'

export type NeighborQuote = {
  text: string
  /** Nombre de la entidad a la que pertenece la cita vecina. */
  entityName: string
}

export type QuoteForReflect = {
  text: string
  source?: string | null
  context?: string | null
  userReflection?: string | null
  entity: {
    name: string
    type: string
    description?: string | null
  }
  /** κ6: citas semánticamente vecinas en la trama del usuario. La IA puede
      apoyarse en ellas para proponer una lectura cruzada en vez de
      interpretar la cita aislada. */
  neighbors?: NeighborQuote[]
}

/**
 * Ask the LLM to write a short interpretation of a quote — not a summary,
 * not a paraphrase, but a reading: what the quote points at, what it leaves
 * unsaid, where it might lead.
 *
 * El usuario verá la interpretación y decide si guardarla. Si ya escribió
 * su propia reflexión, se le pide al LLM que NO la repita.
 *
 * κ6: si hay citas vecinas (por embedding), se las pasa como contexto y se
 * invita a sugerir una lectura cruzada — "esta cita resuena con esa otra
 * tuya, y juntas dicen algo que separadas no". Es la diferencia entre
 * una interpretación genérica y una que reconoce tu archivo entero.
 */
export function buildReflectPrompt(quote: QuoteForReflect): LLMMessage[] {
  const ownReflection = quote.userReflection?.trim()
  const entityLine = `${quote.entity.name} [${quote.entity.type}]${
    quote.entity.description ? ` — ${quote.entity.description}` : ''
  }`

  const neighbors = (quote.neighbors ?? []).filter((n) => n.text?.trim())
  // Truncamos cada vecina a ~180 chars para que el prompt no se infle —
  // queremos que la IA SIENTA el archivo, no que lo lea entero.
  const neighborsBlock =
    neighbors.length > 0
      ? `\n\nOtras citas tuyas que resuenan semánticamente con ésta (úsalas si te ayudan a leer en contexto; no las cites a menos que aporten):\n${neighbors
          .map((n, i) => {
            const t = n.text.length > 180 ? `${n.text.slice(0, 180)}…` : n.text
            return `${i + 1}. «${t}» — ${n.entityName}`
          })
          .join('\n')}`
      : ''

  const crossReadingHint =
    neighbors.length > 0
      ? `\n- Si hay una resonancia clara con alguna cita vecina, nómbrala brevemente (sin citarla entera) — eso vuelve la interpretación íntima del archivo del usuario.`
      : ''

  const system = `Eres un colaborador del usuario en su "Trama", un mapa cognitivo personal de afinidades intelectuales y estéticas. El usuario te muestra una cita y te pide una interpretación breve.

Tu trabajo: escribir UN párrafo corto (máximo 5-6 oraciones, 80 palabras como máximo) en español, con voz reflexiva y literaria. No resumes la cita ni la parafraseas. No la elogias. Apuntas a lo que dice, a lo que deja sin decir, o a una posible lectura — algo que el usuario no tendría obvio al releerla sola.

REGLAS:
- Sin markdown, sin viñetas, sin encabezados. Solo prosa.
- No empieces con "Esta cita…" ni "El autor…". Empieza con la idea.
- Si el usuario ya escribió su propia reflexión (te la paso abajo), NO la repitas ni la contradigas. Construye sobre ella o aporta otro ángulo.
- Si la cita es ambigua o muy breve, dilo: una frase honesta sobre el límite es mejor que rellenar.
- No inventes contexto biográfico que no esté en lo que te paso.${crossReadingHint}

Cita: «${quote.text}»
Atribuida a: ${entityLine}${quote.source ? `\nFuente: ${quote.source}` : ''}${
    quote.context ? `\nContexto que dio el usuario: ${quote.context}` : ''
  }${ownReflection ? `\nReflexión propia del usuario: "${ownReflection}"` : ''}${neighborsBlock}

Devuelve SOLO el párrafo, sin comillas envolventes, sin firma.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: 'Escribe la interpretación.' },
  ]
}
