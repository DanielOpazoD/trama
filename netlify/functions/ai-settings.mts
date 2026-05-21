import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { ALL_TASKS, invalidateAITaskCache } from './_lib/ai-tasks.js'
import { withObservability } from './_lib/handler-wrap.js'

/**
 * GET  /api/ai-settings  → returns the full task→provider map. Tasks without
 *                          a row appear with provider=null (= use env default).
 * PUT  /api/ai-settings  → upsert a single task's config.
 *                          body: { task, provider, model?, verifyWith? }.
 *                          provider='' clears the row (reverts to default).
 */

const VALID_PROVIDERS = new Set(['deepseek', 'openai', 'anthropic', 'gemini'])

export default withObservability('ai-settings', async (req) => {
  const sql = getSql()

  if (req.method === 'GET') {
    type Row = {
      task: string
      provider: string
      model: string | null
      verify_with: string | null
      updated_at: string
    }
    const rows = (await sql`
      SELECT task, provider, model, verify_with, updated_at
      FROM ai_task_providers
    `) as Row[]
    const byTask = new Map(rows.map((r) => [r.task, r]))

    return Response.json({
      defaultProvider: Netlify.env.get('AI_PROVIDER') ?? 'deepseek',
      visionDefaultProvider: Netlify.env.get('AI_VISION_PROVIDER') ?? null,
      tasks: ALL_TASKS.map((task) => {
        const r = byTask.get(task)
        return {
          task,
          provider: r?.provider ?? null,
          model: r?.model ?? null,
          verifyWith: r?.verify_with ?? null,
          updatedAt: r?.updated_at ?? null,
        }
      }),
    })
  }

  if (req.method === 'PUT') {
    const body = (await req.json().catch(() => ({}))) as {
      task?: string
      provider?: string
      model?: string | null
      verifyWith?: string | null
    }
    const task = body.task?.trim()
    if (!task || !(ALL_TASKS as string[]).includes(task)) {
      return new Response(`task "${task ?? ''}" no es válida`, { status: 400 })
    }

    const provider = (body.provider ?? '').trim().toLowerCase()
    // Empty provider → delete the row, reverting to env default.
    if (provider === '') {
      await sql`DELETE FROM ai_task_providers WHERE task = ${task}`
      invalidateAITaskCache()
      return new Response(null, { status: 204 })
    }
    if (!VALID_PROVIDERS.has(provider)) {
      return new Response(`provider "${provider}" no es válido`, { status: 400 })
    }

    const verifyWith = (body.verifyWith ?? '').trim().toLowerCase() || null
    if (verifyWith && !VALID_PROVIDERS.has(verifyWith)) {
      return new Response(`verifyWith "${verifyWith}" no es válido`, { status: 400 })
    }
    if (verifyWith && verifyWith === provider) {
      return new Response('verifyWith debe ser distinto del provider principal', { status: 400 })
    }

    const model = (body.model ?? '').trim() || null

    await sql`
      INSERT INTO ai_task_providers (task, provider, model, verify_with)
      VALUES (${task}, ${provider}, ${model}, ${verifyWith})
      ON CONFLICT (task) DO UPDATE SET
        provider    = EXCLUDED.provider,
        model       = EXCLUDED.model,
        verify_with = EXCLUDED.verify_with
    `
    invalidateAITaskCache()
    return new Response(null, { status: 204 })
  }

  return new Response('Method not allowed', { status: 405 })
})

export const config: Config = {
  path: '/api/ai-settings',
}
