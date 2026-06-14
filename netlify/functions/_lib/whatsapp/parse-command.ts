import type { CaptureIntent } from './types.js'
import { slugifyEntityType } from './entity-type.js'

/**
 * Parser híbrido de mensajes entrantes (camino SIN LLM).
 *
 * Reconoce comandos de control (`vincular <código>`, `ayuda`) y prefijos
 * explícitos (`nota:`, `cita:`, `entidad:`, `momento:`). Si el mensaje no
 * trae prefijo, devuelve `{ kind: 'freeform' }` y el webhook lo manda al
 * clasificador IA. Así el usuario elige: prefijo = instantáneo y gratis;
 * texto libre = magia (cuesta tokens).
 */
export type ParsedInbound =
  | { kind: 'empty' }
  | { kind: 'help' }
  | { kind: 'undo' }
  | { kind: 'status' }
  | { kind: 'query'; text: string }
  | { kind: 'link'; rawCode: string }
  | { kind: 'intent'; intent: CaptureIntent }
  | { kind: 'freeform'; text: string }

/** Quita tildes para comparar palabras clave de forma tolerante. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Separadores aceptados entre texto y autor / nombre y tipo. */
const SEP_RE = /\s+(?:—|–|--|\||-)\s+/

/** Cita: "texto — autor". Si no hay separador, author queda vacío. */
function parseQuote(rest: string): CaptureIntent {
  const m = SEP_RE.exec(rest)
  if (m && m.index > 0) {
    const text = rest.slice(0, m.index).trim()
    const author = rest.slice(m.index + m[0].length).trim()
    return { kind: 'quote', text, author }
  }
  return { kind: 'quote', text: rest.trim(), author: '' }
}

/** Entidad: "nombre (tipo)" o "nombre — tipo". Tipo default: concepto. */
function parseEntity(rest: string): CaptureIntent {
  const paren = /^(.*)\(([^)]+)\)\s*$/.exec(rest.trim())
  if (paren && paren[1]!.trim()) {
    return {
      kind: 'entity',
      name: paren[1]!.trim(),
      entityType: slugifyEntityType(paren[2]),
      description: null,
    }
  }
  const m = SEP_RE.exec(rest)
  if (m && m.index > 0) {
    return {
      kind: 'entity',
      name: rest.slice(0, m.index).trim(),
      entityType: slugifyEntityType(rest.slice(m.index + m[0].length)),
      description: null,
    }
  }
  return { kind: 'entity', name: rest.trim(), entityType: 'concepto', description: null }
}

const KEYWORDS: Record<string, CaptureIntent['kind']> = {
  nota: 'note',
  note: 'note',
  cita: 'quote',
  quote: 'quote',
  frase: 'quote',
  entidad: 'entity',
  entity: 'entity',
  momento: 'momento',
  moment: 'momento',
}

export function parseInboundMessage(raw: string): ParsedInbound {
  const text = raw.trim()
  if (!text) return { kind: 'empty' }

  // Primer token (sin barra inicial opcional estilo /comando).
  const firstWord = fold(text.split(/\s+/, 1)[0]!.replace(/^\//, ''))

  if (firstWord === 'vincular' || firstWord === 'link') {
    const rest = text.replace(/^\/?\S+\s*/, '').trim()
    return { kind: 'link', rawCode: rest }
  }
  if (firstWord === 'ayuda' || firstWord === 'help' || text === '?') {
    return { kind: 'help' }
  }
  if (firstWord === 'deshacer' || firstWord === 'undo') {
    return { kind: 'undo' }
  }
  if (firstWord === 'estado' || firstWord === 'status') {
    return { kind: 'status' }
  }

  // Recall ("preguntale a tu Trama"): "buscar: ..." o "? ..." (con texto).
  const query = /^\/?(buscar|busca|buscá)\s*:?\s*([\s\S]+)$/i.exec(text)
  if (query && query[2]!.trim()) {
    return { kind: 'query', text: query[2]!.trim() }
  }
  if (text.startsWith('?') && text.slice(1).trim()) {
    return { kind: 'query', text: text.slice(1).trim() }
  }

  // Prefijo con dos puntos: "nota: ...", "/cita ...".
  // Aceptamos "palabra:" o "/palabra " como marcador.
  const colon = /^\/?([a-záéíóúñ]+)\s*:\s*([\s\S]+)$/i.exec(text)
  const slash = /^\/([a-záéíóúñ]+)\s+([\s\S]+)$/i.exec(text)
  const match = colon ?? slash
  if (match) {
    const kw = fold(match[1]!)
    const kind = KEYWORDS[kw]
    const rest = match[2]!.trim()
    if (kind && rest) {
      switch (kind) {
        case 'note':
          return { kind: 'intent', intent: { kind: 'note', content: rest } }
        case 'quote':
          return { kind: 'intent', intent: parseQuote(rest) }
        case 'entity':
          return { kind: 'intent', intent: parseEntity(rest) }
        case 'momento':
          return { kind: 'intent', intent: { kind: 'momento', bodyText: rest } }
      }
    }
  }

  return { kind: 'freeform', text }
}
