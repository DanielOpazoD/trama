/**
 * τ-IA: prompt listo para copiar al portapapeles. El usuario lo pega en
 * cualquier IA (ChatGPT, Claude, Gemini…) para que genere un archivo JSON
 * con citas de uno o más autores, importable directo a Trama.
 *
 * El formato espeja el body mínimo de POST /api/import (v1 legado aceptado):
 * `entities[]` + `quotes[]`, vinculadas por id (quote.entityId === entity.id).
 * El import inserta los `id` tal cual (no remapea), así que deben ser únicos.
 *
 * Mantener sincronizado con:
 *   - netlify/functions/import.mts            (campos + vinculación por id)
 *   - netlify/functions/_lib/admin-schemas.ts (version: 1 | 2)
 *   - netlify/functions/_lib/quote-schemas.ts (campos de cita, incl. link)
 *   - src/types/entity.ts                     (tipos de entidad válidos)
 */
export const QUOTES_IMPORT_PROMPT = `Quiero que generes un archivo JSON para importar citas a mi aplicación "Trama".

OBJETIVO
Te voy a dar uno o más autores (al final de este mensaje). Para cada autor, incluye entre 8 y 15 de sus citas más conocidas y verificables. No inventes citas ni atribuciones: si no tienes certeza de que una frase sea realmente de ese autor, omítela.

FORMATO EXACTO (no agregues ni quites campos):

{
  "version": 1,
  "entities": [
    {
      "id": "<id-único-del-autor>",
      "type": "<tipo>",
      "name": "<nombre completo del autor>",
      "year": <año de nacimiento o null>,
      "description": "<una sola línea: quién es>"
    }
  ],
  "quotes": [
    {
      "id": "<id-único-de-la-cita>",
      "entityId": "<id del autor al que pertenece la cita>",
      "text": "<la cita textual, sin comillas envolventes>",
      "source": "<obra/libro de origen, o null>",
      "context": "<nota breve opcional, o null>",
      "link": "<URL de la fuente en línea, o null>"
    }
  ]
}

REGLAS
- "version" es siempre el número 1.
- Cada autor va una vez en "entities". Cada cita va en "quotes".
- VINCULACIÓN (lo más importante): el "entityId" de cada cita debe ser EXACTAMENTE igual al "id" del autor correspondiente.
- Todos los "id" deben ser únicos. Usa slugs legibles: el autor "borges", sus citas "borges-1", "borges-2", etc. (Trama los convierte a sus identificadores internos al importar; lo único que importa es que sean únicos y que los "entityId" coincidan.)
- "type" debe ser uno de estos valores EXACTOS (sin acentos): persona, escritor, filosofo, musico, banda, director, artista, cientifico, libro, ensayo, poema, articulo, cancion, podcast, album, disco, pelicula, serie, documental, obra, concepto, idea, lugar, evento. Para un autor literario usa "escritor"; para un filósofo "filosofo"; para un músico "musico".
- "text" es la cita textual exacta, sin las comillas «» o "" alrededor.
- "link" es una URL (https://…) a la fuente en línea de la cita (artículo, video, entrevista, página del libro). Si no tienes una URL confiable, usa null. No inventes enlaces.
- Campos opcionales: si no aplican, pon null (no los borres). Son "year", "description", "source", "context" y "link".
- Responde ÚNICAMENTE con el JSON válido. Sin texto antes ni después, sin explicaciones y sin envolverlo en bloques de código con tildes.

EJEMPLO DE ESTRUCTURA (un autor, dos citas — reemplaza por contenido real):

{
  "version": 1,
  "entities": [
    { "id": "autor-ejemplo", "type": "escritor", "name": "Nombre del Autor", "year": 1899, "description": "Breve descripción del autor en una línea." }
  ],
  "quotes": [
    { "id": "autor-ejemplo-1", "entityId": "autor-ejemplo", "text": "La cita textual completa, tal como la escribió el autor.", "source": "Título de la obra", "context": null, "link": "https://ejemplo.com/articulo" },
    { "id": "autor-ejemplo-2", "entityId": "autor-ejemplo", "text": "Otra cita del mismo autor.", "source": null, "context": "verso final del poema", "link": null }
  ]
}

AUTORES QUE QUIERO (reemplaza esta línea por los nombres, separados por comas):
- `
