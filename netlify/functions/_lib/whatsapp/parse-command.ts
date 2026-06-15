import type { CaptureIntent, CaptureKind } from './types.js'
import { slugifyEntityType } from './entity-type.js'

/**
 * Parser híbrido de mensajes entrantes (camino SIN LLM).
 *
 * Reconoce comandos de control (`vincular <código> [etiqueta]`, `ayuda`,
 * `deshacer`, `estado`), edición rápida de la última captura (`título …`,
 * `etiqueta …`), reclasificación (palabra suelta: `nota` / `momento` /
 * `entidad`), consultas (`buscar:` / `?`) y prefijos explícitos (`nota:`,
 * `cita:`, `entidad:`, `momento:`). Si el mensaje no encaja, devuelve
 * `{ kind: 'freeform' }` y el webhook lo manda al clasificador IA. Así el
 * usuario elige: prefijo = instantáneo y gratis; texto libre = magia (cuesta
 * tokens).
 */
export type ParsedInbound =
  | { kind: 'empty' }
  | { kind: 'help' }
  | { kind: 'undo' }
  | { kind: 'status' }
  | { kind: 'query'; text: string }
  | { kind: 'link'; rawCode: string; label?: string }
  | { kind: 'recategorize'; toKind: 'note' | 'momento' | 'entity' }
  | { kind: 'retitle'; title: string }
  | { kind: 'tag'; tags: string }
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

/** Tarea: "título — detalle". Sin separador, el detalle queda vacío. */
function parseTask(rest: string): CaptureIntent {
  const m = SEP_RE.exec(rest)
  if (m && m.index > 0) {
    return {
      kind: 'task',
      title: rest.slice(0, m.index).trim(),
      detail: rest.slice(m.index + m[0].length).trim() || null,
    }
  }
  return { kind: 'task', title: rest.trim(), detail: null }
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

const KEYWORDS: Record<string, CaptureKind> = {
  nota: 'note',
  note: 'note',
  cita: 'quote',
  quote: 'quote',
  frase: 'quote',
  entidad: 'entity',
  entity: 'entity',
  momento: 'momento',
  moment: 'momento',
  tarea: 'task',
  tareas: 'task',
  task: 'task',
  pendiente: 'task',
}

/** Palabras sueltas que reclasifican la última captura. Cita queda fuera:
 *  necesita autor, así que para convertir a cita se usa el prefijo `cita:`. */
const RECATEGORIZE: Record<string, 'note' | 'momento' | 'entity'> = {
  nota: 'note',
  note: 'note',
  momento: 'momento',
  moment: 'momento',
  entidad: 'entity',
  entity: 'entity',
}

export function parseInboundMessage(raw: string): ParsedInbound {
  const text = raw.trim()
  if (!text) return { kind: 'empty' }

  const tokens = text.split(/\s+/)
  // Primer token sin barra inicial (estilo /comando) ni dos puntos finales.
  const cmd = fold(tokens[0]!.replace(/^\//, '')).replace(/:$/, '')
  // Resto del mensaje tras el primer token (limpiando ":" o espacios sobrantes).
  const rest = text
    .slice(tokens[0]!.length)
    .replace(/^\s*:?\s*/, '')
    .trim()
  const single = tokens.length === 1

  if (cmd === 'vincular' || cmd === 'link') {
    // "vincular ABC123 trabajo" → código + etiqueta opcional del dispositivo.
    const codeTokens = rest.split(/\s+/)
    const rawCode = codeTokens[0] ?? ''
    const label = codeTokens.slice(1).join(' ').trim()
    return label ? { kind: 'link', rawCode, label } : { kind: 'link', rawCode }
  }
  if (cmd === 'ayuda' || cmd === 'help' || text === '?') {
    return { kind: 'help' }
  }
  if (cmd === 'deshacer' || cmd === 'undo') {
    return { kind: 'undo' }
  }
  if (cmd === 'estado' || cmd === 'status') {
    return { kind: 'status' }
  }

  // Edición rápida de la última captura.
  if ((cmd === 'titulo' || cmd === 'title') && rest) {
    return { kind: 'retitle', title: rest }
  }
  if (
    (cmd === 'etiqueta' || cmd === 'etiquetas' || cmd === 'tag' || cmd === 'tags') &&
    rest
  ) {
    return { kind: 'tag', tags: rest }
  }

  // Reclasificar: una palabra suelta que nombra un tipo.
  if (single && RECATEGORIZE[cmd]) {
    return { kind: 'recategorize', toKind: RECATEGORIZE[cmd] }
  }

  // Recall ("pregúntale a tu Trama"): "buscar: ..." o "? ..." (con texto).
  const query = /^\/?(buscar|busca|buscá)\s*:?\s*([\s\S]+)$/i.exec(text)
  if (query && query[2]!.trim()) {
    return { kind: 'query', text: query[2]!.trim() }
  }
  if (text.startsWith('?') && text.slice(1).trim()) {
    return { kind: 'query', text: text.slice(1).trim() }
  }

  // Prefijo con dos puntos: "nota: ...", "/cita ...".
  const colon = /^\/?([a-záéíóúñ]+)\s*:\s*([\s\S]+)$/i.exec(text)
  const slash = /^\/([a-záéíóúñ]+)\s+([\s\S]+)$/i.exec(text)
  const match = colon ?? slash
  if (match) {
    const kw = fold(match[1]!)
    const kind = KEYWORDS[kw]
    const body = match[2]!.trim()
    if (kind && body) {
      switch (kind) {
        case 'note':
          return { kind: 'intent', intent: { kind: 'note', content: body } }
        case 'quote':
          return { kind: 'intent', intent: parseQuote(body) }
        case 'entity':
          return { kind: 'intent', intent: parseEntity(body) }
        case 'momento':
          return { kind: 'intent', intent: { kind: 'momento', bodyText: body } }
        case 'task':
          return { kind: 'intent', intent: parseTask(body) }
      }
    }
  }

  return { kind: 'freeform', text }
}
