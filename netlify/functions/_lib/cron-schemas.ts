import { z } from 'zod'

/**
 * E5 — Schema del body que Netlify manda a las Scheduled Functions.
 *
 * Netlify invoca los crons con un POST cuyo body trae `{ next_run: <ISO> }`
 * (la próxima ejecución programada). Antes los handlers casteaban
 * `req.json().catch(() => ({})) as { next_run?: string }` sin validar.
 *
 * Acá lo pasamos por Zod manteniendo la MISMA tolerancia: un body inválido o
 * ausente NO debe tirar el cron (sólo perdemos un dato de logging). Por eso el
 * helper usa `safeParse` y degrada a `{}`. Lo único que cambia respecto del
 * cast es que ahora un `next_run` con tipo equivocado (p.ej. un número) se
 * descarta en vez de filtrarse como string roto al log.
 */
export const CronTriggerBody = z
  .object({
    next_run: z.string().optional(),
  })
  .passthrough()
export type CronTriggerBodyT = z.infer<typeof CronTriggerBody>

/**
 * Parsea el body de una Scheduled Function de forma tolerante.
 * - JSON inválido (body vacío / no-JSON) → `{}`
 * - JSON válido pero shape inesperado → `{}` (sin `next_run`)
 * - JSON válido con `next_run` string → lo conserva
 *
 * Nunca tira: el cron debe correr aunque el trigger venga raro.
 */
export async function parseCronTriggerBody(req: Request): Promise<CronTriggerBodyT> {
  const raw = await req.json().catch(() => null)
  if (raw === null) return {}
  const parsed = CronTriggerBody.safeParse(raw)
  return parsed.success ? parsed.data : {}
}
