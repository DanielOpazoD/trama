import type { LLMMessage } from './llm'

const ENTITY_TYPES = [
  'persona',
  'libro',
  'cancion',
  'album',
  'pelicula',
  'obra',
  'concepto',
  'idea',
] as const

const RELATIONSHIP_TYPES = [
  'influye_en',
  'cita_a',
  'responde_a',
  'me_llego_por',
  'suena_como',
  'inspira',
  'contradice',
  'asociado_con',
] as const

export type ExistingEntityLite = { id: string; name: string; type: string }

export function buildExtractionPrompt(
  userText: string,
  existing: ExistingEntityLite[],
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

Tipos válidos de entidad: ${ENTITY_TYPES.join(', ')}
Tipos válidos de relación: ${RELATIONSHIP_TYPES.join(', ')}

REGLAS:
- Sé conservador: si no estás seguro de algo (año, descripción, tipo), omítelo. Es mejor proponer menos pero certero.
- La descripción de cada entidad debe ser UNA frase corta (máximo 15 palabras), neutra, informativa. No literaria.
- Las relaciones son dirigidas: "fromName → toName". Por ejemplo, "Camus → influye_en → Sartre" significa que Camus influye en Sartre.
- Si el usuario menciona una entidad que YA existe en la lista de existentes (por nombre, exacto o muy cercano), NO la repitas en "entities". Solo úsala por nombre en relaciones o citas.
- Si una cita es atribuida a alguien o sacada de un libro, usa el nombre de la persona o del libro como entityName.
- Si no hay entidades nuevas, devuelve "entities": [].
- Si no hay relaciones claras, devuelve "relationships": [].
- Si no hay citas, devuelve "quotes": [].

Entidades ya existentes en la Trama del usuario (no las repitas en "entities" pero puedes referenciarlas por nombre):
${existingList}

DEVUELVE EXCLUSIVAMENTE un objeto JSON con esta forma exacta:

{
  "entities": [
    { "type": "persona|libro|cancion|album|pelicula|obra|concepto|idea", "name": "string", "year": 1234, "description": "frase corta opcional" }
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
