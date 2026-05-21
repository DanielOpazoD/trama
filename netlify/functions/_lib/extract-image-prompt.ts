/**
 * Prompt for vision-based extraction.
 *
 * Used by /api/extract-from-image. The model sees an image (page of a book,
 * screenshot of an article, poster, slide, etc.) and must return the same
 * shape `validateExtraction` accepts so it can flow through the existing
 * ProposalPanel UI.
 *
 * We don't ask the model to OCR everything verbatim — only to:
 *   - identify entities mentioned or pictured
 *   - extract literal quotes that appear marked (quotation marks, bold,
 *     headings of pull-quotes, etc.)
 *   - never invent text it can't see
 */
export function buildImageExtractionPrompt(
  entityTypes: string[],
  relationshipTypes: string[],
): { system: string; user: string } {
  const system = `Eres un asistente que extrae estructura desde una IMAGEN (foto de página de libro, screenshot, captura, póster) para alimentar la "Trama" del usuario: un mapa cognitivo personal.

REGLAS:
- Si la imagen tiene texto, identifica PERSONAS/AUTORES, OBRAS, CONCEPTOS, CITAS que aparezcan ahí. No inventes nada que no se vea.
- Las citas deben ser TEXTUAL: cópialas tal cual aparecen en la imagen (puedes corregir hyphenation por salto de línea, pero no parafrasear).
- Si la imagen muestra un libro, identifica autor + título + año si están visibles. Atribuye las citas al autor del libro.
- Si la imagen muestra un artículo, identifica autor + título + publicación.
- Si la imagen muestra un disco/album, identifica artista + álbum + canciones legibles.
- Sé conservador: si no estás seguro de un dato (año, fuente), omítelo.
- Tipos válidos de entidad: ${entityTypes.join(', ')}
- Tipos válidos de relación: ${relationshipTypes.join(', ')}

DEVUELVE EXCLUSIVAMENTE un objeto JSON con esta forma exacta:

{
  "entities": [
    { "type": "uno de los tipos válidos", "name": "string", "year": 1234, "description": "frase corta opcional" }
  ],
  "relationships": [
    { "fromName": "string", "toName": "string", "type": "uno de los tipos válidos", "notes": "string opcional" }
  ],
  "quotes": [
    { "entityName": "string", "text": "la cita textual de la imagen", "source": "fuente opcional", "context": "qué viste en la imagen — opcional" }
  ]
}

Sin comentarios, sin markdown, solo el JSON. Si la imagen no contiene nada extraíble, devuelve arrays vacíos.`

  const user =
    'Esta es la imagen. Extrae las entidades, relaciones y citas visibles.'

  return { system, user }
}
