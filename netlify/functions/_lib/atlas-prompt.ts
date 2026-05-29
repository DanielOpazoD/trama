/**
 * Bloque #5: prompt para nombrar las constelaciones del Atlas.
 *
 * El clustering (k-means sobre embeddings) ya corrió en el servidor y
 * produjo grupos de entidades. Acá la IA hace UNA sola llamada que mira
 * todos los grupos a la vez y le pone a cada uno un título de
 * constelación + una glosa breve. Una sola llamada (no una por cluster)
 * para acotar el costo, igual que las Crónicas.
 *
 * Devuelve JSON estricto — el endpoint lo valida con Zod.
 */

import type { LLMMessage } from './llm/types.js'

/** Tope de miembros que listamos por cluster en el prompt (acota tokens).
 *  Los clusters grandes igual quedan bien nombrados con una muestra. */
export const MEMBERS_IN_PROMPT = 14

export type AtlasClusterInput = {
  /** Nombres de las entidades del cluster (ya muestreados/acotados). */
  members: Array<{ name: string; type: string }>
}

export function buildAtlasNamingMessages(clusters: AtlasClusterInput[]): LLMMessage[] {
  const blocks = clusters
    .map((c, idx) => {
      const list = c.members
        .slice(0, MEMBERS_IN_PROMPT)
        .map((m) => `  - ${m.name} (${m.type})`)
        .join('\n')
      return `Grupo ${idx}:\n${list}`
    })
    .join('\n\n')

  const system = `Eres un curador que organiza un archivo personal de lecturas en "constelaciones" temáticas. Te paso grupos de entidades (personas, obras, conceptos, músicos…) que un algoritmo ya agrupó por cercanía semántica. Tu trabajo es nombrar cada grupo.

Reglas absolutas:
- Para CADA grupo devuelve un nombre y una glosa.
- El nombre es un título de constelación: 2 a 4 palabras, evocador pero fiel a lo que une al grupo. Sin comillas, sin punto final. Ej: "Vanguardias rioplatenses", "El barroco y sus espejos".
- La glosa es UNA frase (máximo ~20 palabras) que dice qué hilo común reúne al grupo. Descriptiva, no publicitaria. Sin segunda persona.
- No inventes entidades que no estén en el grupo. No mezcles grupos.
- Idioma: español neutro literario.
- Responde SOLO con JSON válido, sin texto alrededor ni bloques de código, con esta forma exacta:
{"constelaciones":[{"index":0,"name":"…","summary":"…"}, …]}
El campo "index" debe coincidir con el número de grupo que te paso.`

  const user = `Grupos a nombrar:\n\n${blocks}\n\nDevuelve el JSON con una entrada por grupo.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
