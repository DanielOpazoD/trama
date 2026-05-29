/**
 * V-3: prompt para "Voz de…".
 *
 * El usuario eligió una entidad de su trama (con ≥5 citas reunidas) y le
 * pregunta qué "diría" sobre un tema. La IA arma una VOZ ESPECULATIVA —una
 * lectura activa— usando ÚNICAMENTE las citas que el usuario guardó de esa
 * entidad como sustrato.
 *
 * Contrato clave: NO es la persona real. No es una cita ni una atribución
 * fiel. Es una hipótesis de voz construida desde un archivo parcial y
 * personal. El prompt lo dice explícitamente para que el modelo no invente
 * biografía ni pretenda fidelidad histórica, y la UI lo rotula igual.
 */

import type { LLMMessage } from './llm/types.js'

export type VozQuote = {
  text: string
  source: string | null
}

export function buildVozMessages(input: {
  entityName: string
  entityType: string
  entityDescription: string | null
  quotes: VozQuote[]
  question: string
}): LLMMessage[] {
  const { entityName, entityType, entityDescription, quotes, question } = input

  // Truncamos cada cita a ~280 chars: queremos densidad de voz, no volcar
  // el archivo entero. El orden lo decide el caller (más recientes primero).
  const material = quotes
    .map((q, i) => {
      const text = q.text.length > 280 ? `${q.text.slice(0, 280)}…` : q.text
      return `${i + 1}. «${text.replace(/"/g, '"')}»${q.source ? ` (${q.source})` : ''}`
    })
    .join('\n')

  const descLine = entityDescription ? ` — ${entityDescription.slice(0, 200)}` : ''

  const system = `Eres un colaborador del usuario en su "Trama", un mapa cognitivo personal. El usuario reunió citas de ${entityName} [${entityType}]${descLine} y te pide imaginar qué DIRÍA sobre un tema.

Esto NO es una cita ni una atribución fiel: es una "lectura activa" —una voz especulativa que armas SOLO con el material que el usuario guardó. No eres ${entityName} de verdad; eres una hipótesis de su voz a partir de un archivo parcial.

REGLAS:
- Habla en primera persona, en el registro y las preocupaciones que sugieren las citas. Que suene a esa voz, sin imitarla como parodia.
- Apóyate ÚNICAMENTE en las citas que te paso. NO inventes datos biográficos, fechas, obras ni opiniones que no estén insinuadas en el material.
- Breve: 1 o 2 párrafos, máximo 120 palabras. Español. Sin markdown, sin viñetas, sin comillas envolventes, sin firma.
- Si el material no alcanza para hablar del tema, dilo desde esa misma voz —un límite honesto es mejor que rellenar.

Citas reunidas de ${entityName} (tu único sustrato):
${material}`

  const user = `Tema: ${question.trim()}

Escribe lo que esta voz —según las citas— podría decir al respecto.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
