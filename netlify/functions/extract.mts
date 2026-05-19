import { neon } from '@neondatabase/serverless'
import type { Config, Context } from '@netlify/functions'
import { askLLMForJson } from './_lib/llm.js'
import { buildExtractionPrompt } from './_lib/extract-prompt.js'
import { validateExtraction } from './_lib/extract-validate.js'

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

  const connectionString = Netlify.env.get('NETLIFY_DATABASE_URL')
  if (!connectionString) {
    return new Response('NETLIFY_DATABASE_URL no está configurada', { status: 500 })
  }
  const sql = neon(connectionString)
  const existing = (await sql`
    SELECT id, name, type FROM entities
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC LIMIT 500
  `) as Array<{ id: string; name: string; type: string }>

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

  const cleaned = validateExtraction(raw, existing)
  return Response.json(cleaned)
}

export const config: Config = {
  path: '/api/extract',
}
