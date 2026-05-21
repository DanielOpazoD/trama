import type { LLMMessage } from './llm'

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
}

/**
 * Ask the LLM to write a short interpretation of a quote — not a summary,
 * not a paraphrase, but a reading: what the quote points at, what it leaves
 * unsaid, where it might lead.
 *
 * The user gets to see this and decide whether to save it. If the user
 * already wrote their own reflection, the LLM is told NOT to repeat it.
 */
export function buildReflectPrompt(quote: QuoteForReflect): LLMMessage[] {
  const ownReflection = quote.userReflection?.trim()
  const entityLine = `${quote.entity.name} [${quote.entity.type}]${
    quote.entity.description ? ` — ${quote.entity.description}` : ''
  }`

  const system = `Eres un colaborador del usuario en su "Trama", un mapa cognitivo personal de afinidades intelectuales y estéticas. El usuario te muestra una cita y te pide una interpretación breve.

Tu trabajo: escribir UN párrafo corto (máximo 5-6 oraciones, 80 palabras como máximo) en español, con voz reflexiva y literaria. No resumes la cita ni la parafraseas. No la elogias. Apuntas a lo que dice, a lo que deja sin decir, o a una posible lectura — algo que el usuario no tendría obvio al releerla sola.

REGLAS:
- Sin markdown, sin viñetas, sin encabezados. Solo prosa.
- No empieces con "Esta cita…" ni "El autor…". Empieza con la idea.
- Si el usuario ya escribió su propia reflexión (te la paso abajo), NO la repitas ni la contradigas. Construye sobre ella o aporta otro ángulo.
- Si la cita es ambigua o muy breve, dilo: una frase honesta sobre el límite es mejor que rellenar.
- No inventes contexto biográfico que no esté en lo que te paso.

Cita: «${quote.text}»
Atribuida a: ${entityLine}${quote.source ? `\nFuente: ${quote.source}` : ''}${
    quote.context ? `\nContexto que dio el usuario: ${quote.context}` : ''
  }${ownReflection ? `\nReflexión propia del usuario: "${ownReflection}"` : ''}

Devuelve SOLO el párrafo, sin comillas envolventes, sin firma.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: 'Escribe la interpretación.' },
  ]
}
