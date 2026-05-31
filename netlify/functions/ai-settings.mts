import type { Config } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { ALL_TASKS, invalidateAITaskCache } from './_lib/ai-tasks.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors, ApiSuccess } from './_lib/api-error.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { AISettingsUpsertBody } from './_lib/admin-schemas.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { getEnv } from './_lib/env.js'

/**
 * GET  /api/ai-settings  → returns the full task→provider map para el
 *                          usuario actual. Tasks sin row aparecen con
 *                          provider=null (= usar env default).
 * PUT  /api/ai-settings  → upsert per-user de la config de una task.
 *                          body: { task, provider, model?, verifyWith? }.
 *                          provider='' borra la row (revierte a env default).
 *
 * Multi-user: cada usuario tiene su propia config en `ai_task_providers`
 * con PK compuesto `(user_id, task)` desde la migración 20260526. Si un
 * usuario nuevo no tiene rows, recibe el listado con provider=null y la
 * app cae al `AI_PROVIDER` global del entorno.
 */

const VALID_PROVIDERS = new Set(['deepseek', 'openai', 'anthropic', 'gemini'])

type AISettingsRow = {
  task: string
  provider: string
  model: string | null
  verify_with: string | null
  updated_at: string
}

export default withObservability('ai-settings', async (req, _ctx, { requestId }) => {
  const authedUser = await getAuthedUser(req)
  const userId = authedUser.id
  const sql = getSql()

  if (req.method === 'GET') {
    const rows = await sqlTyped<AISettingsRow>(sql`
      SELECT task, provider, model, verify_with, updated_at
      FROM ai_task_providers
      WHERE user_id = ${userId}
    `)
    const byTask = new Map(rows.map((r) => [r.task, r]))

    const env = getEnv()
    return Response.json({
      defaultProvider: env.AI_PROVIDER,
      visionDefaultProvider: env.AI_VISION_PROVIDER ?? null,
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
    await ensureUserRow(sql, authedUser)
    const parsed = await parseJsonBody(req, AISettingsUpsertBody, requestId)
    if (!parsed.ok) return parsed.response
    const body = parsed.data
    const task = body.task.trim()
    if (!(ALL_TASKS as string[]).includes(task)) {
      return ApiErrors.validation(requestId, `task "${task}" no es válida`)
    }

    const provider = (body.provider ?? '').trim().toLowerCase()
    // Empty provider → delete the row, reverting to env default.
    if (provider === '') {
      await sql`DELETE FROM ai_task_providers WHERE user_id = ${userId} AND task = ${task}`
      invalidateAITaskCache(userId)
      return ApiSuccess.noContent()
    }
    if (!VALID_PROVIDERS.has(provider)) {
      return ApiErrors.validation(requestId, `provider "${provider}" no es válido`)
    }

    const verifyWith = (body.verifyWith ?? '').trim().toLowerCase() || null
    if (verifyWith && !VALID_PROVIDERS.has(verifyWith)) {
      return ApiErrors.validation(requestId, `verifyWith "${verifyWith}" no es válido`)
    }
    if (verifyWith && verifyWith === provider) {
      return ApiErrors.validation(requestId, 'verifyWith debe ser distinto del provider principal')
    }

    const model = (body.model ?? '').trim() || null

    await sql`
      INSERT INTO ai_task_providers (user_id, task, provider, model, verify_with)
      VALUES (${userId}, ${task}, ${provider}, ${model}, ${verifyWith})
      ON CONFLICT (user_id, task) DO UPDATE SET
        provider    = EXCLUDED.provider,
        model       = EXCLUDED.model,
        verify_with = EXCLUDED.verify_with
    `
    invalidateAITaskCache(userId)
    return ApiSuccess.noContent()
  }

  return ApiErrors.methodNotAllowed(requestId)
})

export const config: Config = {
  path: '/api/ai-settings',
}
