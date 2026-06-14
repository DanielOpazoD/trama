import type { CaptureIntent } from './types.js'

/**
 * Visión/OCR para fotos entrantes de WhatsApp. Cuando el usuario manda una foto
 * con caption `cita:` (de la página de un libro/pantalla) o `nota:`/`texto:`/
 * `ocr:` (cualquier texto), pasamos la imagen por un LLM de visión para extraer
 * contenido estructurado en vez de guardar solo el píxel.
 *
 * El prompt y el validador viven acá (puros, testeables). La llamada al modelo
 * (`askLLMForVision`) y los guards de presupuesto/AI-mode quedan en el webhook,
 * que ante cualquier falla cae a guardar la imagen como Recorte (nunca se
 * pierde lo que mandó el usuario).
 */

export type PhotoMode = 'quote' | 'text'

export function buildPhotoPrompt(mode: PhotoMode): { system: string; user: string } {
  if (mode === 'quote') {
    return {
      system: [
        'Sos un extractor de citas a partir de una foto (página de libro, pantalla, cartel).',
        'Devolvé SOLO un objeto JSON: {"text": string, "author": string}.',
        '- "text": la cita textual, transcrita fielmente, sin comillas envolventes.',
        '- "author": el autor si es deducible (firma, nombre en la página); si no, "".',
        'No inventes autor. Si no hay una cita clara, poné en "text" el texto principal y "author": "".',
      ].join('\n'),
      user: 'Extraé la cita y su autor de esta imagen.',
    }
  }
  return {
    system: [
      'Transcribí el texto visible en la imagen (OCR).',
      'Devolvé SOLO un objeto JSON: {"text": string} con el texto limpio y ordenado,',
      'respetando saltos de párrafo, sin comentarios ni descripciones de la imagen.',
    ].join('\n'),
    user: 'Transcribí el texto de esta imagen.',
  }
}

/**
 * Normaliza la respuesta del modelo a una `CaptureIntent` lista para
 * `persistCapture`. En modo `quote` exige texto + autor; si falta el autor (o
 * el modelo no devolvió texto), cae a `note` con lo que haya — así el resultado
 * SIEMPRE es persistible y nunca pedimos autor por una foto.
 */
export function validatePhotoExtraction(
  content: unknown,
  mode: PhotoMode,
  fallbackCaption: string,
): CaptureIntent {
  const obj =
    content && typeof content === 'object' ? (content as Record<string, unknown>) : {}
  const text = typeof obj.text === 'string' ? obj.text.trim() : ''

  if (mode === 'quote') {
    const author = typeof obj.author === 'string' ? obj.author.trim() : ''
    if (text && author) return { kind: 'quote', text, author }
    if (text) return { kind: 'note', content: text }
  } else if (text) {
    return { kind: 'note', content: text }
  }

  const fallback = fallbackCaption.trim()
  return {
    kind: 'note',
    content: fallback || '📷 Imagen sin texto legible (desde WhatsApp)',
  }
}
