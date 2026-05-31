import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { runClassify } from './_lib/x/index.js'

/**
 * POST /api/x/classify — clasifica por tema (vía LLM, por lotes) los bookmarks
 * que aún no tienen tema. On-demand: cada llamada procesa hasta MAX_BATCHES
 * lotes y devuelve `remaining` para que la UI siga si quedan. Respeta el
 * cost-cap mensual y el modo IA (off → 423).
 */
const MAX_BATCHES = 5

export default withObservability(
  'x-classify',
  async (req: Request, _ctx: Context, { requestId }) => {
    if (req.method !== 'POST') return ApiErrors.methodNotAllowed(requestId)
    const { id: userId } = await getAuthedUser(req)

    const budgetExceeded = await checkMonthlyBudget(userId, requestId)
    if (budgetExceeded) return budgetExceeded

    const invocation = await resolveAIInvocation(req, 'classify', userId)
    if (invocation.kind === 'off') return aiOffResponse(requestId)

    const sql = getSql()
    try {
      const { classified, remaining } = await runClassify(
        sql,
        userId,
        { provider: invocation.provider, model: invocation.model },
        MAX_BATCHES,
      )
      logEvent({ event: 'x_classify_completed', classified, remaining })
      return Response.json({ classified, remaining })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return ApiErrors.upstream(requestId, `Error clasificando temas: ${message}`)
    }
  },
)

export const config: Config = {
  path: '/api/x/classify',
}
