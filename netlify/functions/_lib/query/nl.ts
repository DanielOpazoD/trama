import type { LLMMessage } from '../llm.js'
import { QueryBody, OBJECT_KINDS, type QueryInput } from './ast.js'
import { FIELDS, KIND_META } from './field-registry.js'
import { compileQuery, QueryCompileError } from './compile.js'

/**
 * Traductor de lenguaje natural → AST de query (Fase 3 del motor de queries).
 *
 * El prompt y la validación son puros y testeables; la llamada al LLM se inyecta
 * (`NlAsk`) para poder testear contra Postgres real con un stub. El catálogo
 * (tipos/campos/ops/propiedades/relaciones) se arma desde el field-registry, así
 * el modelo sólo conoce campos que el compilador acepta.
 *
 * Diseño defensivo: si el LLM produce un AST inválido, hay UN intento de
 * reparación (re-prompt con el error de Zod); si vuelve a fallar, o si la IA
 * está off / sin presupuesto, se cae a una búsqueda de texto libre sobre todos
 * los tipos — el usuario SIEMPRE recibe resultados.
 */

export type NlContext = {
  /** Fecha ISO (YYYY-MM-DD) para resolver rangos relativos ("el mes pasado"). */
  today: string
  /** Slugs de entity_types, para que el modelo mapee "filósofo" → type 'filosofo'. */
  entityTypes: string[]
}

/** Descripción compacta de kinds + campos + capacidades, derivada del registry. */
export function buildCatalogText(): string {
  return OBJECT_KINDS.map((kind) => {
    const fields = Object.entries(FIELDS[kind])
      .map(([name, def]) => `${name}(${def.type})`)
      .join(', ')
    const meta = KIND_META[kind]
    const caps = [
      meta.fts || meta.ftsFallback ? 'matches' : null,
      meta.hasTags ? 'tags' : null,
      'prop:<clave>',
      meta.linkToEntity ? 'linked_to' : null,
    ]
      .filter(Boolean)
      .join(', ')
    return `- ${kind}: campos [${fields}]; soporta [${caps}]`
  }).join('\n')
}

const EXAMPLES = [
  '{"from":["entity"],"where":{"and":[{"field":"type","op":"eq","value":"filosofo"},{"field":"year","op":"lt","value":1900}]}}',
  '{"from":["entity","quote","momento","note"],"where":{"op":"matches","value":"estoicismo"}}',
  '{"from":["note"],"where":{"field":"tags","op":"has_any","value":["trabajo"]},"sort":{"field":"created_at","dir":"desc"}}',
  '{"from":["momento"],"where":{"field":"captured_at","op":"between","value":["2026-05-01","2026-05-31"]}}',
].join('\n')

export function buildNlPrompt(q: string, ctx: NlContext): LLMMessage[] {
  const system = [
    'Sos un traductor de lenguaje natural a una QUERY estructurada (AST en JSON) para "Trama", el segundo cerebro del usuario.',
    'Devolvé SOLO un objeto JSON (sin texto ni markdown) con esta forma:',
    '{ "from": ObjectKind[], "where"?: Condición, "sort"?: {"field":"created_at"|"occurred_at","dir":"asc"|"desc"}, "limit"?: number }',
    '',
    'Tipos de objeto y campos disponibles:',
    buildCatalogText(),
    '',
    'Predicados: {"field","op":"eq"|"neq"|"lt"|"lte"|"gt"|"gte"|"contains","value"}, {"field","op":"between","value":[a,b]}, {"field","op":"in","value":[...]}, {"field":"tags","op":"has_any"|"has_all","value":[...]}, {"op":"matches","value":"texto"}, {"field":"prop:<clave>","op":"exists"}, {"op":"linked_to","id":"<uuid>"}.',
    'Combinadores: {"and":[...]}, {"or":[...]}, {"not":{...}}.',
    'Propiedades de usuario: referenciá "prop:<clave>" (ej "prop:team"). Vínculos: linked_to apunta a una entidad por id.',
    `Tipos de entidad conocidos (para entity.type): ${ctx.entityTypes.join(', ') || '—'}.`,
    `Hoy es ${ctx.today}. Para rangos relativos calculá fechas ISO y usá "between" sobre created_at (o captured_at en momentos).`,
    'Reglas: usá SOLO los campos listados. Elegí en "from" los tipos relevantes (uno o varios). Si la intención es difusa, preferí {"op":"matches","value":<palabras clave>} sobre los tipos que correspondan.',
    '',
    'Ejemplos (entrada → JSON):',
    EXAMPLES,
  ].join('\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: q },
  ]
}

export function buildRepairPrompt(
  q: string,
  ctx: NlContext,
  bad: unknown,
  error: string,
): LLMMessage[] {
  return [
    ...buildNlPrompt(q, ctx),
    { role: 'assistant', content: JSON.stringify(bad) },
    {
      role: 'user',
      content: `Ese JSON no validó: ${error}. Devolvé SOLO el JSON corregido que matchee el esquema.`,
    },
  ]
}

export function validateNlQuery(
  content: unknown,
): { ok: true; query: QueryInput } | { ok: false; error: string } {
  const parsed = QueryBody.safeParse(content)
  if (!parsed.success) {
    const error = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)
      .join('; ')
    return { ok: false, error }
  }
  // Zod garantiza la forma, pero no que el AST sea compilable (p.ej. un op no
  // permitido para el tipo del campo: {field:'type',op:'lt'}). Hacemos un
  // dry-run del compilador para no dejar pasar un AST que tiraría 500 en
  // runQuery; si no compila, lo tratamos como inválido (→ reparación/fallback).
  try {
    compileQuery(parsed.data)
  } catch (err) {
    if (err instanceof QueryCompileError) return { ok: false, error: err.message }
    throw err
  }
  return { ok: true, query: parsed.data }
}

/** Fallback sin IA / ante fallo: búsqueda de texto libre sobre todos los tipos. */
export function fallbackQuery(q: string): QueryInput {
  return { from: [...OBJECT_KINDS], where: { op: 'matches', value: q.slice(0, 200) } }
}

export type NlAsk = (messages: LLMMessage[]) => Promise<{ content: unknown }>

/**
 * Traduce `q` a un AST: pide al LLM, valida, repara una vez si hace falta, y
 * cae al fallback de texto libre ante cualquier problema. Devuelve también la
 * fuente (`llm` | `fallback`) para que el caller/UI lo señale.
 */
export async function translateNl(
  q: string,
  ctx: NlContext,
  ask: NlAsk,
): Promise<{ query: QueryInput; source: 'llm' | 'fallback' }> {
  try {
    const first = await ask(buildNlPrompt(q, ctx))
    const v1 = validateNlQuery(first.content)
    if (v1.ok) return { query: v1.query, source: 'llm' }

    const repaired = await ask(buildRepairPrompt(q, ctx, first.content, v1.error))
    const v2 = validateNlQuery(repaired.content)
    if (v2.ok) return { query: v2.query, source: 'llm' }
  } catch {
    /* cae al fallback */
  }
  return { query: fallbackQuery(q), source: 'fallback' }
}
