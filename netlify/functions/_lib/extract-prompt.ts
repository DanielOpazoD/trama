import type { LLMMessage } from './llm'

export type ExistingEntityLite = { id: string; name: string; type: string }

export function buildExtractionPrompt(
  userText: string,
  existing: ExistingEntityLite[],
  entityTypes: string[],
  relationshipTypes: string[],
): LLMMessage[] {
  const existingList =
    existing.length === 0
      ? '(ninguna todavía)'
      : existing.map((e) => `- ${e.name} [${e.type}]`).join('\n')

  const system = `Eres un asistente que extrae estructura de un texto libre del usuario para alimentar su "Trama", un mapa cognitivo personal de afinidades intelectuales y estéticas.

El usuario te entrega un párrafo desordenado donde menciona personas, obras, libros, canciones, álbumes, películas, conceptos o ideas. Tu trabajo es:

1. Identificar entidades nombradas o claramente referenciadas.
2. Inferir relaciones entre ellas (con tipo).
3. Recolectar citas textuales si el usuario las incluye (entre comillas o claramente marcadas).

Tipos válidos de entidad: ${entityTypes.join(', ')}
Tipos válidos de relación: ${relationshipTypes.join(', ')}

REGLAS:
- Sé conservador: si no estás seguro de algo (año, descripción, tipo), omítelo.
- La descripción de cada entidad debe ser UNA frase corta (máximo 15 palabras), neutra, informativa.
- Las relaciones son dirigidas: "fromName → toName". Por ejemplo, "Camus → influye_en → Sartre".
- Si el usuario menciona una entidad que YA existe en la lista de existentes, NO la repitas en "entities". Solo úsala por nombre.
- Si no hay entidades nuevas, devuelve "entities": []. Lo mismo para relaciones y citas.

Entidades ya existentes en la Trama del usuario:
${existingList}

DEVUELVE EXCLUSIVAMENTE un objeto JSON con esta forma exacta:

{
  "entities": [
    { "type": "uno de los tipos válidos", "name": "string", "year": 1234, "description": "frase corta opcional" }
  ],
  "relationships": [
    { "fromName": "string", "toName": "string", "type": "uno de los tipos válidos", "notes": "string opcional" }
  ],
  "quotes": [
    { "entityName": "string", "text": "la cita textual", "source": "fuente opcional", "context": "tu interpretación opcional" }
  ]
}

Sin comentarios, sin markdown, solo el JSON.`

  const user = `Texto del usuario:\n"""\n${userText}\n"""`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
