import type { LLMMessage } from './llm'

export type EntityForReclassify = {
  id: string
  name: string
  type: string
  year?: number | null
  description?: string | null
  quotes?: string[]
}

export type ReclassifyTypeOption = {
  slug: string
  label: string
}

/**
 * Ask the LLM to spot entities whose `type` is wrong and propose a better one
 * from the available type catalog. Common case: a band ("Pink Floyd") was
 * stored as 'persona' because no closer type existed at extraction time, but
 * 'banda' is now available.
 *
 * The LLM must only propose changes that meaningfully improve the
 * classification; if the current type is fine, leave it alone.
 */
export function buildReclassifyPrompt(
  entities: EntityForReclassify[],
  types: ReclassifyTypeOption[],
): LLMMessage[] {
  const typesBlock = types
    .map((t) => `- ${t.slug} (${t.label})`)
    .join('\n')

  const entitiesBlock = entities
    .map((e) => {
      const meta = [e.year ?? null].filter(Boolean).join(', ')
      const head = `• id=${e.id} | "${e.name}" | tipo actual: ${e.type}${meta ? ` | (${meta})` : ''}`
      const desc = e.description ? `\n  ${e.description}` : ''
      const qs = (e.quotes ?? []).slice(0, 3)
      const quotes =
        qs.length === 0
          ? ''
          : '\n  Citas:\n' + qs.map((q) => `   - «${q}»`).join('\n')
      return `${head}${desc}${quotes}`
    })
    .join('\n')

  const system = `Eres un asistente que ayuda a un usuario a CLASIFICAR mejor las entidades de su "Trama" — un mapa cognitivo personal.

Te paso una lista de entidades con su tipo actual y los tipos disponibles. Tu trabajo: identificar las que están MAL clasificadas y proponer el mejor tipo dentro del catálogo.

REGLAS ESTRICTAS:
- Solo propón cambios cuando el tipo actual sea claramente subóptimo y haya uno mejor en el catálogo. Si el tipo actual es razonable, NO la incluyas.
- El nuevo tipo debe ser uno de los slugs del catálogo, exacto.
- En "reason" escribe UNA frase corta (máximo 20 palabras) explicando por qué el nuevo tipo es mejor.
- Sé conservador. Es mejor proponer pocas y certeras que muchas dudosas.
- Casos típicos: una banda guardada como 'persona' → 'banda'; un escritor como 'persona' → 'escritor' si su rol literario es lo relevante; un álbum como 'cancion' → 'album'.
- "persona" es válido para individuos cuya identidad no se reduce a un rol (un amigo, un médico, etc.). NO reclasifiques a todo 'persona' como un rol — solo cuando el rol es la razón de su lugar en la trama.

Catálogo de tipos disponibles:
${typesBlock}

Entidades a evaluar:
${entitiesBlock}

DEVUELVE EXCLUSIVAMENTE un objeto JSON con esta forma:

{
  "reclassifications": [
    { "id": "uuid de la entidad", "newType": "nuevo-slug", "reason": "por qué" }
  ]
}

Sin comentarios, sin markdown, solo el JSON. Si no hay nada que reclasificar, devuelve "reclassifications": [].`

  return [
    { role: 'system', content: system },
    { role: 'user', content: 'Revisa las clasificaciones y propón mejoras.' },
  ]
}
