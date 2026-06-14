import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

// El camino freeform usa cost-cap + ai-mode + llm. Los mockeamos para
// ejercitar ese flujo sin red ni presupuesto real.
vi.mock('./cost-cap.js', () => ({ checkMonthlyBudget: vi.fn().mockResolvedValue(null) }))
vi.mock('./ai-mode.js', () => ({
  resolveAIInvocation: vi
    .fn()
    .mockResolvedValue({
      kind: 'ready',
      provider: 'deepseek',
      model: null,
      verifyWith: null,
    }),
}))
const askLLMForJson = vi.fn()
vi.mock('./llm.js', () => ({
  askLLMForJson: (...args: unknown[]) => askLLMForJson(...args),
}))

import webhookHandler from '../whatsapp-webhook'

/**
 * Endpoint whatsapp-webhook (entrante de Twilio). SQL mockeado. Cubre:
 * vínculo, no-vinculado, captura por prefijo, captura freeform (LLM),
 * idempotencia por MessageSid, y verificación de firma.
 */
function twilioRequest(fields: Record<string, string>): Request {
  // MessageSid por defecto (Twilio siempre lo manda) para ejercitar el claim
  // de idempotencia; un test puede sobreescribirlo.
  const body = new URLSearchParams({ MessageSid: 'SMtest', ...fields }).toString()
  return new Request('http://localhost/api/whatsapp-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
}

beforeEach(() => {
  mockSqlResponses.reset()
  askLLMForJson.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe('whatsapp-webhook', () => {
  it('número no vinculado → instrucciones de vinculación', async () => {
    mockSqlResponses.push([]) // resolveUserByPhone: sin vínculo
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'nota: hola' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/xml')
    const xml = await res.text()
    expect(xml).toContain('no está vinculado')
  })

  it('captura por prefijo nota: cuando el número está vinculado', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim (reclamado)
    mockSqlResponses.push([]) // UPDATE last_message_at (fire-and-forget)
    mockSqlResponses.push([]) // INSERT notes
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'nota: comprar pan' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const xml = await res.text()
    expect(xml).toContain('Nota guardada')
  })

  it('captura freeform → el LLM clasifica y se persiste', async () => {
    askLLMForJson.mockResolvedValue({
      content: { kind: 'note', note: { content: 'me acordé de algo' } },
      usage: {
        provider: 'deepseek',
        model: 'x',
        tokensIn: 10,
        tokensOut: 5,
        costCents: 1,
        durationMs: 100,
      },
      fromCache: false,
    })
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([]) // extraction_log (fire-and-forget)
    mockSqlResponses.push([]) // INSERT notes
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'me acordé de algo' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(askLLMForJson).toHaveBeenCalledOnce()
    expect(await res.text()).toContain('Nota guardada')
  })

  it('idempotencia: un MessageSid ya procesado no re-escribe (TwiML vacío)', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([]) // claim → ON CONFLICT, 0 filas (duplicado)
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'nota: comprar pan' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).not.toContain('<Message>')
  })

  it('vincular con código válido confirma', async () => {
    mockSqlResponses.push([{ id: 'link-1' }]) // redeemLinkCode CTE → 1 fila
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'vincular ABC234' }),
      mockContext(),
    )
    const xml = await res.text()
    expect(xml).toContain('vinculado')
  })

  it('vincular con código vencido avisa', async () => {
    mockSqlResponses.push([]) // redeemLinkCode → 0 filas
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'vincular ZZZZ99' }),
      mockContext(),
    )
    const xml = await res.text()
    expect(xml).toContain('vencido')
  })

  it('ayuda devuelve el menú', async () => {
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'ayuda' }),
      mockContext(),
    )
    const xml = await res.text()
    expect(xml).toContain('nota:')
  })

  it('remitente sin E164 válido → TwiML vacío', async () => {
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:hola', Body: 'nota: x' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).not.toContain('<Message>')
  })

  it('GET no permitido', async () => {
    const res = await webhookHandler(
      new Request('http://localhost/api/whatsapp-webhook'),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  it('firma inválida cuando TWILIO_AUTH_TOKEN está configurado → 401', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret')
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'nota: x' }),
      mockContext(),
    )
    expect(res.status).toBe(401)
  })
})
