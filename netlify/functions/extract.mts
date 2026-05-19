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
  try {
    const { content, usage } = await askLLMForJson(messages)
    const cleaned = validateExtraction(content, existing)

    // Persist the extraction event (fire-and-forget; don't block the response on logging).
    sql`
      INSERT INTO extraction_log (
        input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms
      ) VALUES (
        ${text},
        ${JSON.stringify(cleaned)}::jsonb,
        ${usage.provider},
        ${usage.model},
        ${usage.tokensIn},
        ${usage.tokensOut},
        ${usage.costCents},
        ${usage.durationMs}
      )
    `.catch(() => {
      // Best-effort logging — failure here shouldn't break extraction.
    })

    return Response.json(cleaned)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Log the failure too so we can debug bad prompts / API outages.
    sql`
      INSERT INTO extraction_log (input_text, proposal, provider, model, error)
      VALUES (${text}, '{}'::jsonb, ${'unknown'}, ${'unknown'}, ${message})
    `.catch(() => {})
    return new Response(`Error llamando al LLM: ${message}`, { status: 502 })
  }
}

export const config: Config = {
  path: '/api/extract',
}
