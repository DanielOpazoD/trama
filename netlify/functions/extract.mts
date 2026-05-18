import { neon } from '@neondatabase/serverless'
import type { Config, Context } from '@netlify/functions'
import { askLLMForJson } from './_lib/llm.js'
import { buildExtractionPrompt } from './_lib/extract-prompt.js'

type ProposalShape = {
  entities?: Array<{
    type?: string
    name?: string
    year?: number
    description?: string
  }>
  relationships?: Array<{
    fromName?: string
    toName?: string
    type?: string
    notes?: string
  }>
  quotes?: Array<{
    entityName?: string
    text?: string
    source?: string
    context?: string
  }>
}

const VALID_ENTITY_TYPES = new Set([
  'persona',
  'libro',
  'cancion',
  'album',
  'pelicula',
  'obra',
  'concepto',
  'idea',
])

const VALID_RELATIONSHIP_TYPES = new Set([
  'influye_en',
  'cita_a',
  'responde_a',
  'me_llego_por',
  'suena_como',
  'inspira',
  'contradice',
  'asociado_con',
])

function normalizeName(s: string): string {
  return s.trim().toLowerCase()
}

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body: { text?: string }
  try {
    body = (await req.json()) as { text?: string }
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const text = (body.text ?? '').trim()
  if (!text) {
    return new Response('Falta el campo "text"', { status: 400 })
  }

  // Read existing entities (only id, name, type) for the prompt context.
  const connectionString = Netlify.env.get('NETLIFY_DATABASE_URL')
  if (!connectionString) {
    return new Response('NETLIFY_DATABASE_URL no está configurada', { status: 500 })
  }
  const sql = neon(connectionString)
  const existing = (await sql`
    SELECT id, name, type FROM entities ORDER BY created_at DESC LIMIT 500
  `) as Array<{ id: string; name: string; type: string }>

  // Ask the LLM.
  const messages = buildExtractionPrompt(text, existing)
  let raw: unknown
  try {
    raw = await askLLMForJson(messages)
  } catch (err) {
    return new Response(
      `Error llamando al LLM: ${err instanceof Error ? err.message : String(err)}`,
      { status: 502 },
    )
  }

  // Validate the response shape and clean it up.
  const proposal = raw as ProposalShape
  const existingByName = new Map<string, { id: string; type: string }>()
  for (const e of existing) {
    existingByName.set(normalizeName(e.name), { id: e.id, type: e.type })
  }

  const entities = (proposal.entities ?? [])
    .filter((e) => e?.name && e?.type && VALID_ENTITY_TYPES.has(e.type))
    .map((e) => {
      const match = existingByName.get(normalizeName(e.name!))
      return {
        matchedId: match?.id,
        type: e.type!,
        name: e.name!.trim(),
        year: typeof e.year === 'number' ? e.year : undefined,
        description: e.description?.trim() || undefined,
      }
    })

  const relationships = (proposal.relationships ?? [])
    .filter(
      (r) =>
        r?.fromName &&
        r?.toName &&
        r?.type &&
        VALID_RELATIONSHIP_TYPES.has(r.type) &&
        normalizeName(r.fromName) !== normalizeName(r.toName),
    )
    .map((r) => ({
      fromName: r.fromName!.trim(),
      toName: r.toName!.trim(),
      type: r.type!,
      notes: r.notes?.trim() || undefined,
    }))

  const quotes = (proposal.quotes ?? [])
    .filter((q) => q?.entityName && q?.text)
    .map((q) => ({
      entityName: q.entityName!.trim(),
      text: q.text!.trim(),
      source: q.source?.trim() || undefined,
      context: q.context?.trim() || undefined,
    }))

  return Response.json({ entities, relationships, quotes })
}

export const config: Config = {
  path: '/api/extract',
}
