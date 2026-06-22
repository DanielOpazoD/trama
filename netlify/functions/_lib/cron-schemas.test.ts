import { describe, expect, it } from 'vitest'
import { CronTriggerBody, parseCronTriggerBody } from './cron-schemas'

/**
 * E5 — El body del cron pasa por Zod, pero la tolerancia se mantiene: un body
 * inválido NUNCA debe tirar la Scheduled Function (sólo perdemos un dato de
 * logging). `parseCronTriggerBody` degrada a `{}`; el schema sólo descarta un
 * `next_run` con tipo equivocado.
 */

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/cron', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('CronTriggerBody', () => {
  it('acepta next_run string y descarta extras vía passthrough', () => {
    const parsed = CronTriggerBody.parse({ next_run: '2026-06-22T00:00:00Z', extra: 1 })
    expect(parsed.next_run).toBe('2026-06-22T00:00:00Z')
  })

  it('rechaza next_run con tipo equivocado (no lo filtra como string roto)', () => {
    expect(() => CronTriggerBody.parse({ next_run: 123 })).toThrow()
  })
})

describe('parseCronTriggerBody (tolerante)', () => {
  it('extrae next_run de un body válido', async () => {
    const out = await parseCronTriggerBody(
      jsonRequest({ next_run: '2026-06-22T00:00:00Z' }),
    )
    expect(out.next_run).toBe('2026-06-22T00:00:00Z')
  })

  it('body vacío {} → {} sin tirar', async () => {
    expect(await parseCronTriggerBody(jsonRequest({}))).toEqual({})
  })

  it('JSON no parseable → {} sin tirar', async () => {
    const req = new Request('http://localhost/cron', { method: 'POST', body: 'no-json{' })
    expect(await parseCronTriggerBody(req)).toEqual({})
  })

  it('shape inesperada (next_run numérico) → {} sin next_run, sin tirar', async () => {
    const out = await parseCronTriggerBody(jsonRequest({ next_run: 999 }))
    expect(out.next_run).toBeUndefined()
  })
})
