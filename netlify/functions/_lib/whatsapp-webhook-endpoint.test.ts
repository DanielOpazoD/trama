import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

// El camino freeform usa cost-cap + ai-mode + llm. Los mockeamos para
// ejercitar ese flujo sin red ni presupuesto real.
vi.mock('./cost-cap.js', () => ({ checkMonthlyBudget: vi.fn().mockResolvedValue(null) }))
vi.mock('./ai-mode.js', () => ({
  resolveAIInvocation: vi.fn().mockResolvedValue({
    kind: 'ready',
    provider: 'deepseek',
    model: null,
    verifyWith: null,
  }),
}))
const askLLMForJson = vi.fn()
const askLLMForVision = vi.fn()
const askLLMForText = vi.fn()
const askLLMForTranscription = vi.fn()
vi.mock('./llm.js', () => ({
  askLLMForJson: (...args: unknown[]) => askLLMForJson(...args),
  askLLMForVision: (...args: unknown[]) => askLLMForVision(...args),
  askLLMForText: (...args: unknown[]) => askLLMForText(...args),
  askLLMForTranscription: (...args: unknown[]) => askLLMForTranscription(...args),
}))
// RAG mockeado: el recall no toca embeddings/DB real en este test.
const buildRagContext = vi.fn()
vi.mock('./rag-context.js', () => ({
  buildRagContext: (...args: unknown[]) => buildRagContext(...args),
}))
// Blobs mockeado: el upload de media no toca red real.
vi.mock('@netlify/blobs', () => ({
  getStore: () => ({ set: vi.fn().mockResolvedValue(undefined) }),
}))

import webhookHandler from '../whatsapp-webhook'
import { expectedTwilioSignature } from './whatsapp/twilio-signature'

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
  askLLMForVision.mockReset()
  askLLMForText.mockReset()
  askLLMForTranscription.mockReset()
  buildRagContext.mockReset()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

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
    expect(xml).toContain('no está conectado')
  })

  it('captura por prefijo nota: confirma con deep link y opción de deshacer', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim (reclamado)
    mockSqlResponses.push([]) // UPDATE last_message_at (fire-and-forget)
    mockSqlResponses.push([{ id: 'n1' }]) // INSERT notes RETURNING id
    mockSqlResponses.push([]) // UPDATE last_capture (fire-and-forget)
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'nota: comprar pan' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const xml = await res.text()
    expect(xml).toContain('Nota guardada')
    expect(xml).toContain('world=notas') // deep link a la vista
    expect(xml).toContain('deshacer') // affordance de undo
  })

  it('captura por prefijo tarea: inserta la tarea y deep-linkea a Tareas', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim (reclamado)
    mockSqlResponses.push([]) // UPDATE last_message_at (fire-and-forget)
    mockSqlResponses.push([{ id: 't1' }]) // INSERT tasks RETURNING id
    mockSqlResponses.push([]) // UPDATE last_capture (fire-and-forget)
    const res = await webhookHandler(
      twilioRequest({
        From: 'whatsapp:+56912345678',
        Body: 'tarea: llamar al banco — antes del viernes',
      }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const xml = await res.text()
    expect(xml).toContain('Tarea')
    expect(xml).toContain('section=tareas') // deep link a la sección Tareas
    expect(xml).toContain('deshacer')
  })

  it('nota de voz → la transcribe (Whisper) y la guarda como Nota', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'audio/ogg' },
        arrayBuffer: async () => new ArrayBuffer(200),
      }),
    )
    askLLMForTranscription.mockResolvedValue({
      text: 'acordarme de comprar pan',
      usage: { provider: 'openai', model: 'whisper-1', costCents: 0.2, durationMs: 50 },
    })
    const fields = {
      MessageSid: 'SMaudio',
      From: 'whatsapp:+56912345678',
      Body: '',
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.com/Media/voz.ogg',
      MediaContentType0: 'audio/ogg',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMaudio' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([]) // INSERT extraction_log (registro de costo)
    mockSqlResponses.push([{ id: 'n9' }]) // INSERT notes RETURNING id
    mockSqlResponses.push([]) // INSERT notas_attachments (audio re-escuchable)
    mockSqlResponses.push([]) // recordLastCapture

    const res = await webhookHandler(
      new Request('http://localhost/api/whatsapp-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-twilio-signature': sig,
        },
        body: new URLSearchParams(fields).toString(),
      }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(askLLMForTranscription).toHaveBeenCalledTimes(1)
    // El audio se conserva como anexo de la nota (re-escuchable).
    expect(
      mockSqlResponses.calls.some((c) =>
        /INSERT INTO notas_attachments/i.test(c.template),
      ),
    ).toBe(true)
    const xml = await res.text()
    expect(xml).toContain('Notas') // guardado en Notas
    expect(xml).toContain('world=notas') // deep link
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
    mockSqlResponses.push([{ id: 'n1' }]) // INSERT notes RETURNING id
    mockSqlResponses.push([]) // UPDATE last_capture (fire-and-forget)
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'me acordé de algo' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(askLLMForJson).toHaveBeenCalledOnce()
    expect(await res.text()).toContain('Nota guardada')
  })

  it('deshacer → soft-deletea la última captura', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim (antes del comando)
    mockSqlResponses.push([]) // UPDATE last_message_at (fire-and-forget)
    mockSqlResponses.push([{ kind: 'note', cap_id: 'n1' }]) // SELECT last_capture
    mockSqlResponses.push([{ id: 'n1' }]) // UPDATE notes (soft-delete) RETURNING id
    mockSqlResponses.push([]) // UPDATE clear last_capture (fire-and-forget)
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'deshacer' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('se eliminó')
  })

  it('deshacer sin captura previa avisa que no hay nada', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([]) // SELECT last_capture → vacío
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'deshacer' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('nada reciente')
  })

  it('vincular con etiqueta de dispositivo → bienvenida con la etiqueta', async () => {
    mockSqlResponses.push([{ id: 'link-1' }]) // redeemLinkCode CTE → 1 fila
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'vincular ABC234 trabajo' }),
      mockContext(),
    )
    const xml = await res.text()
    expect(xml).toContain('trabajo')
    expect(xml).toContain('Pruébalo')
  })

  it('título <texto> → renombra la última captura (nota)', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ kind: 'note', cap_id: 'n1' }]) // readLastPointer
    mockSqlResponses.push([{ id: 'n1' }]) // UPDATE notes SET title RETURNING
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'título Mi gran idea' }),
      mockContext(),
    )
    expect(await res.text()).toContain('Título actualizado')
  })

  it('etiqueta <palabras> → agrega tags a la última captura (nota)', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ kind: 'note', cap_id: 'n1' }]) // readLastPointer
    mockSqlResponses.push([{ id: 'n1' }]) // UPDATE notes SET tags RETURNING
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'etiqueta trabajo, ideas' }),
      mockContext(),
    )
    expect(await res.text()).toContain('Etiquetas agregadas')
  })

  it('palabra suelta "momento" → reclasifica la última nota', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ kind: 'note', cap_id: 'n1' }]) // readLastPointer
    mockSqlResponses.push([{ t: 'comprar pan' }]) // readCaptureText (content)
    mockSqlResponses.push([{ id: 'm1' }]) // persistMomento INSERT RETURNING
    mockSqlResponses.push([{ id: 'n1' }]) // softDelete nota RETURNING
    mockSqlResponses.push([]) // recordLastCapture UPDATE
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'momento' }),
      mockContext(),
    )
    expect(await res.text()).toContain('Reclasificado')
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
    expect(xml).toContain('conectado')
  })

  it('vincular con código vencido avisa', async () => {
    mockSqlResponses.push([]) // redeemLinkCode → 0 filas
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'vincular ZZZZ99' }),
      mockContext(),
    )
    const xml = await res.text()
    expect(xml).toContain('venció')
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

  it('foto sin prefijo → Recorte (descarga, sube y persiste)', async () => {
    // Para procesar media se necesita TWILIO_AUTH_TOKEN, lo que activa la
    // verificación de firma: la calculamos para que el request sea válido.
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => new ArrayBuffer(8),
      }),
    )
    const fields = {
      MessageSid: 'SMmedia',
      From: 'whatsapp:+56912345678',
      Body: '',
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.com/Media/abc',
      MediaContentType0: 'image/jpeg',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMmedia' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ id: 'r1' }]) // INSERT recorte RETURNING id
    mockSqlResponses.push([]) // recordLastCapture (fire-and-forget)
    const res = await webhookHandler(
      new Request('http://localhost/api/whatsapp-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-twilio-signature': sig,
        },
        body: new URLSearchParams(fields).toString(),
      }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const xml = await res.text()
    expect(xml).toContain('Recortes')
    expect(xml).toContain('view=recortes')
  })

  it('foto con "nota:" → visión transcribe y guarda Nota', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => new ArrayBuffer(8),
      }),
    )
    askLLMForVision.mockResolvedValue({
      content: { text: 'apuntes de la reunión' },
      usage: {
        provider: 'openai',
        model: 'gpt',
        tokensIn: 5,
        tokensOut: 5,
        costCents: 1,
        durationMs: 100,
      },
      fromCache: false,
    })
    const fields = {
      MessageSid: 'SMocr',
      From: 'whatsapp:+56912345678',
      Body: 'nota:',
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.com/Media/ocr',
      MediaContentType0: 'image/jpeg',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMocr' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ id: 'n1' }]) // INSERT notes RETURNING id
    mockSqlResponses.push([]) // recordLastCapture
    const res = await webhookHandler(
      new Request('http://localhost/api/whatsapp-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-twilio-signature': sig,
        },
        body: new URLSearchParams(fields).toString(),
      }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(askLLMForVision).toHaveBeenCalledOnce()
    const xml = await res.text()
    expect(xml).toContain('Notas')
    expect(xml).toContain('world=notas')
  })

  it('query (buscar:) → recall con RAG compone respuesta', async () => {
    buildRagContext.mockResolvedValue({
      entities: [
        { id: 'e1', name: 'Borges', type: 'escritor', year: null, description: null },
      ],
      relationships: [],
      quotes: [],
      usedRag: true,
    })
    askLLMForText.mockResolvedValue({
      content: 'Tenés a Borges guardado como escritor.',
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
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'buscar: borges' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(buildRagContext).toHaveBeenCalledOnce()
    expect(askLLMForText).toHaveBeenCalledOnce()
    const xml = await res.text()
    expect(xml).toContain('Borges')
    expect(xml).toContain('view=entidades')
  })

  it('query sin resultados avisa amablemente', async () => {
    buildRagContext.mockResolvedValue({
      entities: [],
      relationships: [],
      quotes: [],
      usedRag: false,
    })
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: '? algo que no existe' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Todavía no encontré nada')
  })

  it('estado → resumen del vínculo', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([
      {
        verified_at: '2026-06-01T00:00:00Z',
        last_capture_kind: 'note',
        last_capture_at: '2026-06-14T11:00:00Z',
      },
    ]) // SELECT whatsapp_links
    mockSqlResponses.push([{ n: 4 }]) // COUNT processed_messages
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'estado' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const xml = await res.text()
    expect(xml).toContain('Tu Trama por WhatsApp')
    expect(xml).toContain('Mensajes este mes: 4')
  })

  it('foto con formato no soportado (heic) → avisa sin descargar', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMheic' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    const res = await webhookHandler(
      twilioRequest({
        MessageSid: 'SMheic',
        From: 'whatsapp:+56912345678',
        Body: '',
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.com/Media/heic',
        MediaContentType0: 'image/heic',
      }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('formato no lo soporto')
  })

  it('foto demasiado pesada → avisa el límite', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (k: string) => (k === 'content-length' ? '99999999' : 'image/jpeg'),
        },
        arrayBuffer: async () => new ArrayBuffer(8),
      }),
    )
    const fields = {
      MessageSid: 'SMbig',
      From: 'whatsapp:+56912345678',
      Body: '',
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.com/Media/big',
      MediaContentType0: 'image/jpeg',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMbig' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    const res = await webhookHandler(
      new Request('http://localhost/api/whatsapp-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-twilio-signature': sig,
        },
        body: new URLSearchParams(fields).toString(),
      }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('pesa demasiado')
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
