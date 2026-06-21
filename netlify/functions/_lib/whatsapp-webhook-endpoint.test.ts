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
// Blobs mockeado: el upload de media no toca red real. getWithMetadata sirve la
// copia de blobs al reclasificar un recorte con imágenes (→ Momento / Nota).
vi.mock('@netlify/blobs', () => ({
  getStore: () => ({
    set: vi.fn().mockResolvedValue(undefined),
    getWithMetadata: vi.fn().mockResolvedValue({
      data: new ArrayBuffer(8),
      metadata: { mime: 'image/jpeg', size: '8' },
    }),
  }),
}))

import webhookHandler from '../whatsapp-webhook'
import { expectedTwilioSignature } from './whatsapp/twilio-signature'
import { extractPhotoCapturedAt } from '../../../src/lib/photoExif'

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

function writeAscii(bytes: Uint8Array, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i)
}

function jpegWithExifDate(value: string): ArrayBuffer {
  const exifPayloadLength = 6 + 8 + 2 + 12 + 4 + 2 + 12 + 4 + 20
  const bytes = new Uint8Array(2 + 2 + 2 + exifPayloadLength + 2)
  const view = new DataView(bytes.buffer)
  let p = 0
  bytes[p++] = 0xff
  bytes[p++] = 0xd8
  bytes[p++] = 0xff
  bytes[p++] = 0xe1
  const app1Length = exifPayloadLength + 2
  bytes[p++] = (app1Length >> 8) & 0xff
  bytes[p++] = app1Length & 0xff
  writeAscii(bytes, p, 'Exif\0\0')
  p += 6

  const tiff = p
  bytes[p++] = 0x49
  bytes[p++] = 0x49
  bytes[p++] = 42
  bytes[p++] = 0
  view.setUint32(p, 8, true)
  p += 4

  view.setUint16(p, 1, true)
  p += 2
  view.setUint16(p, 0x8769, true)
  p += 2
  view.setUint16(p, 4, true)
  p += 2
  view.setUint32(p, 1, true)
  p += 4
  view.setUint32(p, 26, true)
  p += 8

  p = tiff + 26
  view.setUint16(p, 1, true)
  p += 2
  view.setUint16(p, 0x9003, true)
  p += 2
  view.setUint16(p, 2, true)
  p += 2
  view.setUint32(p, 20, true)
  p += 4
  view.setUint32(p, 44, true)
  p += 8
  writeAscii(bytes, tiff + 44, `${value}\0`)

  bytes[bytes.length - 2] = 0xff
  bytes[bytes.length - 1] = 0xd9
  return bytes.buffer
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
    mockSqlResponses.push([]) // persistWhatsAppEvent: transcription ok (observabilidad)
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
    mockSqlResponses.push([]) // consumeAwaitingDescription: sin descripción pendiente
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

  it('con plantillas configuradas → manda botones (Content API) y TwiML vacío', async () => {
    // Captura ambigua (texto libre) con la plantilla de destino configurada.
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    vi.stubEnv('TWILIO_CONTENT_SID_CAPTURE_DESTINO', 'HXdest')
    const sendMock = vi.fn().mockResolvedValue({ ok: true, status: 201 })
    vi.stubGlobal('fetch', sendMock)
    askLLMForJson.mockResolvedValue({
      content: { kind: 'note', note: { content: 'me acordé de algo' } },
      usage: {
        provider: 'x',
        model: 'x',
        tokensIn: 1,
        tokensOut: 1,
        costCents: 1,
        durationMs: 1,
      },
      fromCache: false,
    })
    const fields = {
      MessageSid: 'SMbtn',
      From: 'whatsapp:+56912345678',
      To: 'whatsapp:+14155238886',
      Body: 'me acordé de algo',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMbtn' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([]) // consumeAwaitingDescription: sin descripción pendiente
    mockSqlResponses.push([]) // extraction_log
    mockSqlResponses.push([{ id: 'n1' }]) // INSERT notes
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
    // Se mandó el mensaje saliente con botones (plantilla de destino).
    expect(sendMock).toHaveBeenCalledTimes(1)
    const init = sendMock.mock.calls[0][1]
    const body = new URLSearchParams(init.body)
    expect(body.get('ContentSid')).toBe('HXdest')
    expect(body.get('ContentVariables')).toContain('Nota guardada')
    // La respuesta TwiML va vacía (la confirmación viajó por la API, no por XML).
    expect(await res.text()).not.toContain('Nota guardada')
  })

  it('si Twilio rechaza el envío de botones (4xx) → degrada a TwiML con la confirmación', async () => {
    // Garantía central: un fallo del Content API NUNCA deja al usuario sin
    // confirmación. El envío devuelve ok:false → el webhook cae a TwiML de texto.
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    vi.stubEnv('TWILIO_CONTENT_SID_CAPTURE_DESTINO', 'HXdest')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'err' }),
    )
    askLLMForJson.mockResolvedValue({
      content: { kind: 'note', note: { content: 'me acordé de algo' } },
      usage: {
        provider: 'deepseek',
        model: 'x',
        tokensIn: 1,
        tokensOut: 1,
        costCents: 1,
        durationMs: 1,
      },
      fromCache: false,
    })
    const fields = {
      MessageSid: 'SMbtnfail',
      From: 'whatsapp:+56912345678',
      To: 'whatsapp:+14155238886',
      Body: 'me acordé de algo',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMbtnfail' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([]) // consumeAwaitingDescription: sin descripción pendiente
    mockSqlResponses.push([]) // extraction_log
    mockSqlResponses.push([{ id: 'n1' }]) // INSERT notes
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
    const xml = await res.text()
    // La confirmación + la afordancia de corregir viajan por TwiML (no se perdió).
    expect(xml).toContain('Nota guardada')
    expect(xml).toContain('deshacer')
  })

  it('captura explícita con plantilla Card → manda [Abrir en Trama] (deep link como botón)', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    vi.stubEnv('TWILIO_CONTENT_SID_CAPTURE_CARD', 'HXcard')
    const sendMock = vi.fn().mockResolvedValue({ ok: true, status: 201 })
    vi.stubGlobal('fetch', sendMock)
    const fields = {
      MessageSid: 'SMcard',
      From: 'whatsapp:+56912345678',
      To: 'whatsapp:+14155238886',
      Body: 'momento: hoy empecé algo nuevo',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMcard' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ id: 'm1' }]) // INSERT momentos
    mockSqlResponses.push([]) // recordLastCapture
    mockSqlResponses.push([]) // persistWhatsAppEvent
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
    const sendCall = sendMock.mock.calls.at(-1)!
    const body = new URLSearchParams(sendCall[1].body)
    expect(body.get('ContentSid')).toBe('HXcard')
    // {{2}} = sufijo del deep link (lo que el botón URL anexa a su base).
    const vars = JSON.parse(body.get('ContentVariables') ?? '{}')
    expect(typeof vars['2']).toBe('string')
    expect(vars['2'].startsWith('/')).toBe(true)
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

  it('comando que falla (hipo de DB) → 200 con disculpa, nunca deja al usuario sin respuesta', async () => {
    // El MessageSid ya se reclamó: si el handler lanzara y propagáramos, el 500
    // haría que Twilio reintente y el claim deduplicaría el reintento → silencio.
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.pushError(new Error('db hipo')) // undoLastCapture: la query falla
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'deshacer' }),
      mockContext(),
    )
    expect(res.status).toBe(200) // no 500
    expect(res.headers.get('content-type')).toContain('text/xml')
    expect(await res.text()).toContain('No pude completar esa acción')
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
    mockSqlResponses.push([]) // readPendingMedia: no hay foto pendiente
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

  it('palabra suelta "tarea" → reclasifica la última nota a Tarea', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ kind: 'note', cap_id: 'n1' }]) // readLastPointer
    mockSqlResponses.push([{ t: 'comprar pan' }]) // readCaptureText (content)
    mockSqlResponses.push([{ id: 't1' }]) // persistTask INSERT INTO tasks RETURNING
    mockSqlResponses.push([{ id: 'n1' }]) // softDelete nota RETURNING
    mockSqlResponses.push([]) // recordLastCapture UPDATE
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'tarea' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Reclasificado')
    // Creó la tarea y borró la nota original (reclasificación, no duplicado).
    expect(
      mockSqlResponses.calls.some((c) => /INSERT INTO tasks/i.test(c.template)),
    ).toBe(true)
    expect(
      mockSqlResponses.calls.some(
        (c) => /UPDATE notes/i.test(c.template) && /deleted_at/i.test(c.template),
      ),
    ).toBe(true)
  })

  it('"tarea" tras una FOTO no la convierte (evita perder la imagen)', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ kind: 'recorte', cap_id: 'r1' }]) // readLastPointer → foto
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'tarea' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('no se vuelve tarea')
    // No insertó ninguna tarea (la foto sigue intacta como Recorte).
    expect(
      mockSqlResponses.calls.some((c) => /INSERT INTO tasks/i.test(c.template)),
    ).toBe(false)
  })

  it('palabra "momento" sobre un recorte con imágenes → reclasifica SIN perder fotos', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([]) // readPendingMedia: no hay foto pendiente
    mockSqlResponses.push([{ kind: 'recorte', cap_id: 'r1' }]) // readLastPointer
    mockSqlResponses.push([{ t: 'mi gato' }]) // readCaptureText (recorte.text)
    mockSqlResponses.push([{ storage_key: 'u/a.jpg' }, { storage_key: 'u/b.jpg' }]) // readRecorteImageKeys (recorte_images)
    mockSqlResponses.push([{ id: 'm1' }]) // persistImageMomentoEpisode INSERT
    mockSqlResponses.push([{ id: 'r1' }]) // softDelete recorte RETURNING
    mockSqlResponses.push([]) // recordLastCapture UPDATE
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'momento' }),
      mockContext(),
    )
    const xml = await res.text()
    expect(xml).toContain('Reclasificado')
    expect(xml).toContain('imágenes')
    // El INSERT del momento foto usa items[] con las dos fotos copiadas.
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO momentos/i.test(c.template),
    )
    const payload = insert?.values.find(
      (v): v is string => typeof v === 'string' && v.includes('"items"'),
    )
    expect((payload?.match(/"storageKey"/g) ?? []).length).toBe(2)
  })

  it('palabra "momento" sobre un recorte de SOLO TEXTO → cae al camino de texto', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([]) // readPendingMedia: no hay foto pendiente
    mockSqlResponses.push([{ kind: 'recorte', cap_id: 'r1' }]) // readLastPointer
    mockSqlResponses.push([{ t: 'una cita sin imagen' }]) // readCaptureText (caption del branch)
    mockSqlResponses.push([]) // readRecorteImageKeys: recorte_images vacío
    mockSqlResponses.push([{ image_key: null }]) // readRecorteImageKeys: image_key null → no-images
    mockSqlResponses.push([{ t: 'una cita sin imagen' }]) // readCaptureText (camino de texto)
    mockSqlResponses.push([{ id: 'm9' }]) // persistMomento (texto) INSERT
    mockSqlResponses.push([{ id: 'r1' }]) // softDelete recorte
    mockSqlResponses.push([]) // recordLastCapture
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'momento' }),
      mockContext(),
    )
    const xml = await res.text()
    expect(xml).toContain('Reclasificado')
    // Camino de texto: NO promete imágenes (el recorte no tenía).
    expect(xml).not.toContain('con sus imágenes')
    // El momento se creó por texto (kind 'nota'), no como episodio foto (items[]).
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO momentos/i.test(c.template),
    )
    expect(
      insert?.values.some((v) => typeof v === 'string' && v.includes('"items"')),
    ).toBe(false)
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

  it('foto con caption libre → Recorte (descarga, sube y persiste)', async () => {
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
      Body: 'foto para revisar',
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

  it('dos fotos con prefijo recorte → un solo recorte-evento (image_key + recorte_images)', async () => {
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
      MessageSid: 'SMmedia2',
      From: 'whatsapp:+56912345678',
      Body: 'recorte:',
      NumMedia: '2',
      MediaUrl0: 'https://api.twilio.com/Media/abc',
      MediaContentType0: 'image/jpeg',
      MediaUrl1: 'https://api.twilio.com/Media/def',
      MediaContentType1: 'image/jpeg',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMmedia2' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ id: 'r1' }]) // CTE: INSERT recorte + recorte_images RETURNING id
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
    // Una sola entrada-evento: confirma "2 imágenes" como un evento, no 2 sueltas.
    expect(xml).toContain('2 imágenes')
    expect(xml).toContain('evento')
  })

  it('foto sin caption queda pendiente y pregunta destino sin crear recorte por defecto', async () => {
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
      MessageSid: 'SMpendingFoto',
      From: 'whatsapp:+56912345678',
      Body: '',
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.com/Media/pending',
      MediaContentType0: 'image/jpeg',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMpendingFoto' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ n: 1 }]) // storePendingMedia
    mockSqlResponses.push([]) // persistWhatsAppEvent

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
    expect(xml).toContain('¿Dónde la guardo?')
    expect(xml).toContain('momento')
    expect(xml).toContain('recorte')
    expect(
      mockSqlResponses.calls.some(
        (c) =>
          /INSERT INTO recortes\b/i.test(c.template) &&
          !/recorte_images/i.test(c.template),
      ),
    ).toBe(false)
    expect(
      mockSqlResponses.calls.some((c) =>
        /INSERT INTO whatsapp_pending_media/i.test(c.template),
      ),
    ).toBe(true)
  })

  it('responder "momento" consume media pendiente y crea un Momento foto', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    const fields = {
      MessageSid: 'SMpendingDestino',
      From: 'whatsapp:+56912345678',
      Body: 'momento',
      NumMedia: '0',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMpendingDestino' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([
      {
        id: 'p1',
        storage_key: 'u1/pending.jpg',
        mime: 'image/jpeg',
        captured_at: '2026-06-19T23:10:00.000Z',
        caption: '',
      },
    ]) // readPendingMedia
    mockSqlResponses.push([{ id: 'm-pending' }]) // persistImageMomentoEpisode
    mockSqlResponses.push([{ n: 1 }]) // consumePendingMedia
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
    const xml = await res.text()
    expect(xml).toContain('Guardado en Momentos')
    expect(xml).toContain('view=momentos')
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO momentos/i.test(c.template),
    )
    expect(insert?.values).toContain('2026-06-19T23:10:00.000Z')
    expect(
      mockSqlResponses.calls.some((c) =>
        /UPDATE whatsapp_pending_media/i.test(c.template),
      ),
    ).toBe(true)
  })

  it('dos fotos con prefijo "momento:" → un solo Momento foto episódico (items[])', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    const mediaBodies = {
      a: jpegWithExifDate('2026:06:20 14:00:00'),
      b: jpegWithExifDate('2026:06:19 23:10:00'),
    }
    expect(extractPhotoCapturedAt(mediaBodies.b)).toBe('2026-06-19T23:10:00.000')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        async (url: string) =>
          new Response(url.endsWith('/b') ? mediaBodies.b : mediaBodies.a, {
            headers: { 'content-type': 'image/jpeg' },
          }),
      ),
    )
    const fields = {
      MessageSid: 'SMmomento2',
      From: 'whatsapp:+56912345678',
      Body: 'momento: tarde en el taller',
      NumMedia: '2',
      MediaUrl0: 'https://api.twilio.com/Media/a',
      MediaContentType0: 'image/jpeg',
      MediaUrl1: 'https://api.twilio.com/Media/b',
      MediaContentType1: 'image/jpeg',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMmomento2' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ id: 'm1' }]) // persistImageMomentoEpisode INSERT
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
    const xml = await res.text()
    // Un solo momento con las dos fotos (no dos momentos sueltos).
    expect(xml).toContain('2 fotos')
    // El INSERT usa payload.items[] con dos storageKey y el caption del prefijo.
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO momentos/i.test(c.template),
    )
    const payload = insert?.values.find(
      (v): v is string => typeof v === 'string' && v.includes('"items"'),
    )
    expect((payload?.match(/"storageKey"/g) ?? []).length).toBe(2)
    expect(payload).toContain('tarde en el taller')
    expect(insert?.values).toContain('2026-06-19T23:10:00.000')
  })

  it('caption con Fecha explícita usa esa fecha y no anexa a una captura reciente', async () => {
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
      MessageSid: 'SMmomentoFecha',
      From: 'whatsapp:+56912345678',
      Body: 'A momentos. Fecha: 4-07-2026',
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.com/Media/fecha',
      MediaContentType0: 'image/jpeg',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMmomentoFecha' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ id: 'mfecha' }]) // persistImageMomentoEpisode INSERT
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
    const xml = await res.text()
    expect(xml).toContain('Guardado en Momentos')
    expect(xml).toContain('Fecha aplicada: 4 jul 2026')

    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO momentos/i.test(c.template),
    )
    expect(insert?.values).toContain('2026-07-04T12:00:00.000')
    expect(
      mockSqlResponses.calls.some((c) => /last_capture_at > NOW\(\)/i.test(c.template)),
    ).toBe(false)
    expect(mockSqlResponses.calls.some((c) => /UPDATE momentos/i.test(c.template))).toBe(
      false,
    )
  })

  it('dos fotos con caption natural "a momentos" → también un episodio foto', async () => {
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
      MessageSid: 'SMnat2',
      From: 'whatsapp:+56912345678',
      Body: 'a momentos las dos',
      NumMedia: '2',
      MediaUrl0: 'https://api.twilio.com/Media/a',
      MediaContentType0: 'image/jpeg',
      MediaUrl1: 'https://api.twilio.com/Media/b',
      MediaContentType1: 'image/jpeg',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMnat2' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ id: 'm2' }]) // persistImageMomentoEpisode INSERT
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
    const xml = await res.text()
    expect(xml).toContain('2 fotos')
    // La frase-directiva es instrucción, no pie de foto: NO viaja como caption.
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO momentos/i.test(c.template),
    )
    const payload = insert?.values.find(
      (v): v is string => typeof v === 'string' && v.includes('"items"'),
    )
    expect((payload?.match(/"storageKey"/g) ?? []).length).toBe(2)
    expect(payload).not.toContain('"caption"')
  })

  it('foto → Recorte con plantilla de destino → ofrece botones Momento/Nota', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    vi.stubEnv('TWILIO_CONTENT_SID_CAPTURE_DESTINO', 'HXdest')
    // El mismo mock sirve para bajar la media (arrayBuffer) y para mandar el
    // Content API (ok/status); el último fetch es el envío con botones.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => new ArrayBuffer(8),
    })
    vi.stubGlobal('fetch', fetchMock)
    const fields = {
      MessageSid: 'SMmediabtn',
      From: 'whatsapp:+56912345678',
      To: 'whatsapp:+14155238886',
      Body: 'recorte:',
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
    mockSqlResponses.push([{ message_sid: 'SMmediabtn' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ id: 'r1' }]) // INSERT recorte
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
    // El último fetch es el envío del Content API con la plantilla de destino.
    const sendCall = fetchMock.mock.calls.at(-1)!
    const body = new URLSearchParams(sendCall[1].body)
    expect(body.get('ContentSid')).toBe('HXdest')
    expect(body.get('ContentVariables')).toContain('Recortes')
  })

  it('video → Recorte de video en recortes-media', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'video/mp4' },
      arrayBuffer: async () => new ArrayBuffer(8),
    })
    vi.stubGlobal('fetch', fetchMock)
    const fields = {
      MessageSid: 'SMvideo',
      From: 'whatsapp:+56912345678',
      To: 'whatsapp:+14155238886',
      Body: '',
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.com/Media/video',
      MediaContentType0: 'video/mp4',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMvideo' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ id: 'r-video' }]) // INSERT recorte video
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
    const xml = await res.text()
    expect(xml).toContain('Guardado en Recortes')
    expect(xml).not.toContain('todavía no lo proceso')
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO recortes/i.test(c.template),
    )
    expect(insert?.template).toContain("'video'")
  })

  it('foto con recorte explícito sin pie + List Picker configurado → manda la lista «Acciones» (ContentSid actions)', async () => {
    // Prueba de cableado de extremo a extremo del UX-2: con la plantilla List
    // Picker encendida (env var), una foto sin pie hace que Trama MANDE la lista
    // «⚡ Acciones» por la Content API (con la confirmación como {{1}}) en vez de
    // los 3 botones o el texto. El List Picker se renderiza en WhatsApp; acá
    // verificamos lo único verificable en local: que se elige y se manda bien.
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123')
    vi.stubEnv('TWILIO_CONTENT_SID_CAPTURE_ACTIONS', 'HXacts')
    // El mismo mock baja la media (arrayBuffer) y acepta el envío del Content API.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => new ArrayBuffer(8),
    })
    vi.stubGlobal('fetch', fetchMock)
    const fields = {
      MessageSid: 'SMlist1',
      From: 'whatsapp:+56912345678',
      To: 'whatsapp:+14155238886',
      Body: 'recorte:',
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.com/Media/z',
      MediaContentType0: 'image/jpeg',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMlist1' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ id: 'r1' }]) // INSERT recorte
    mockSqlResponses.push([]) // recordLastCapture
    mockSqlResponses.push([]) // setAwaitingDescription
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
    // Respondió TwiML vacío: la confirmación real va por el Content API, no texto.
    const xml = await res.text()
    expect(xml).not.toContain('Responde con una descripción')
    // El último fetch es el envío del List Picker «Acciones».
    const sendCall = fetchMock.mock.calls.at(-1)!
    expect(String(sendCall[0])).toContain('/Messages.json') // Twilio Content API
    const body = new URLSearchParams(sendCall[1].body)
    expect(body.get('ContentSid')).toBe('HXacts') // ← la lista, NO los 3 botones
    // {{1}} de la plantilla = la confirmación de la captura.
    expect(body.get('ContentVariables')).toContain('Recortes')
  })

  it('álbum partido: foto con "juntar" tras un recorte reciente → se ANEXA al evento', async () => {
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
      MessageSid: 'SMcont1',
      From: 'whatsapp:+56912345678',
      Body: 'juntar',
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.com/Media/x',
      MediaContentType0: 'image/jpeg',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMcont1' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ kind: 'recorte', id: 'r1' }]) // readRecentMediaCapture (en ventana)
    mockSqlResponses.push([{ found: true, existing_n: 0, had_cover: true }]) // appendImagesToRecorteEvent
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
    const xml = await res.text()
    // Confirmación de anexado (no "Guardado" de nuevo): el evento crece a 2.
    expect(xml).toContain('+1 foto')
    expect(xml).toContain('evento en Recortes')
    expect(xml).toContain('ahora tiene 2')
    expect(xml).toContain('Para separarla la próxima vez')
    // Anexó a recorte_images; NO creó un recorte nuevo.
    expect(
      mockSqlResponses.calls.some((c) => /INSERT INTO recorte_images/i.test(c.template)),
    ).toBe(true)
    expect(
      mockSqlResponses.calls.some(
        (c) =>
          /INSERT INTO recortes\b/i.test(c.template) &&
          !/recorte_images/i.test(c.template),
      ),
    ).toBe(false)
  })

  it('álbum partido: foto "a momento. juntar" tras un recorte reciente → sube el álbum a Momento', async () => {
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
      MessageSid: 'SMcont2',
      From: 'whatsapp:+56912345678',
      Body: 'a momento. juntar',
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.com/Media/y',
      MediaContentType0: 'image/jpeg',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMcont2' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ kind: 'recorte', id: 'r1' }]) // readRecentMediaCapture
    mockSqlResponses.push([{ storage_key: 'u1/old.jpg' }]) // reclassify → readRecorteImageKeys
    mockSqlResponses.push([{ id: 'm1' }]) // reclassify → persistImageMomentoEpisode INSERT
    mockSqlResponses.push([{ id: 'r1' }]) // softDeleteCapture recorte
    mockSqlResponses.push([{ total: 2 }]) // appendImagesToMomento UPDATE
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
    const xml = await res.text()
    expect(xml).toContain('tu momento')
    expect(xml).toContain('ahora tiene 2')
    // El recorte original se subió a momento (reclasificación) y se soft-borró.
    expect(
      mockSqlResponses.calls.some(
        (c) => /UPDATE recortes/i.test(c.template) && /deleted_at/i.test(c.template),
      ),
    ).toBe(true)
    expect(mockSqlResponses.calls.some((c) => /UPDATE momentos/i.test(c.template))).toBe(
      true,
    )
  })

  it('foto con recorte explícito sin pie → ofrece agregar una descripción (estado conversacional)', async () => {
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
      MessageSid: 'SMdesc1',
      From: 'whatsapp:+56912345678',
      Body: 'recorte:',
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.com/Media/z',
      MediaContentType0: 'image/jpeg',
    }
    const sig = expectedTwilioSignature(
      'secret',
      'http://localhost/api/whatsapp-webhook',
      fields,
    )
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMdesc1' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ id: 'r1' }]) // INSERT recorte
    mockSqlResponses.push([]) // recordLastCapture
    mockSqlResponses.push([]) // setAwaitingDescription
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
    expect(xml).toContain('Responde con una descripción')
    // Marcó el estado conversacional para el próximo texto.
    expect(
      mockSqlResponses.calls.some(
        (c) =>
          /UPDATE whatsapp_links/i.test(c.template) &&
          /awaiting_desc_kind/i.test(c.template),
      ),
    ).toBe(true)
  })

  it('texto libre tras una foto sin pie → se aplica como su descripción', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ kind: 'recorte', id: 'r1' }]) // consumeAwaitingDescription: claim atómico (UPDATE...RETURNING)
    mockSqlResponses.push([{ id: 'r1' }]) // applyDescription: UPDATE recortes
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'una tarde de lluvia' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const xml = await res.text()
    expect(xml).toContain('Descripción agregada')
    // NO se clasificó como captura nueva (no INSERT de nota).
    expect(
      mockSqlResponses.calls.some((c) => /INSERT INTO notes/i.test(c.template)),
    ).toBe(false)
  })

  it('botón [Descripción] (texto "Descripción") tras una foto → pide la descripción', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ kind: 'recorte', cap_id: 'r1' }]) // readLastPointer (describeLast)
    mockSqlResponses.push([]) // setAwaitingDescription
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'Descripción' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const xml = await res.text()
    expect(xml).toContain('mándame la descripción')
    // Dejó el estado conversacional listo para el próximo texto.
    expect(
      mockSqlResponses.calls.some(
        (c) =>
          /UPDATE whatsapp_links/i.test(c.template) &&
          /awaiting_desc_kind/i.test(c.template),
      ),
    ).toBe(true)
  })

  it('«descripción <texto>» tras una foto → la aplica directo', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    mockSqlResponses.push([{ kind: 'recorte', cap_id: 'r1' }]) // readLastPointer
    mockSqlResponses.push([{ id: 'r1' }]) // applyDescription UPDATE recortes
    const res = await webhookHandler(
      twilioRequest({
        From: 'whatsapp:+56912345678',
        Body: 'descripción una tarde de lluvia',
      }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Descripción agregada')
  })

  it('«menú» sin plantilla de menú → cae al texto de ayuda', async () => {
    mockSqlResponses.push([{ user_id: 'u1' }]) // resolveUserByPhone
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ message_sid: 'SMtest' }]) // claim
    mockSqlResponses.push([]) // UPDATE last_message_at
    const res = await webhookHandler(
      twilioRequest({ From: 'whatsapp:+56912345678', Body: 'menú' }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('nota:') // el menú de ayuda en texto
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
    mockSqlResponses.push([]) // extractPhotoIntent: extraction_log (costo de visión al cost-cap)
    mockSqlResponses.push([]) // persistWhatsAppEvent: vision ok (observabilidad)
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
    // El costo de la visión se registra en extraction_log (cuenta al cost-cap).
    expect(
      mockSqlResponses.calls.some(
        (c) =>
          /INSERT INTO extraction_log/i.test(c.template) &&
          c.values.some((v) => typeof v === 'string' && v.includes('"vision":true')),
      ),
    ).toBe(true)
    // Y su evento de observabilidad (visión ok) cuenta a la tasa de fallas honesta.
    expect(
      mockSqlResponses.calls.some(
        (c) =>
          /INSERT INTO whatsapp_events/i.test(c.template) && c.values.includes('vision'),
      ),
    ).toBe(true)
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
      content: 'Tienes a Borges guardado como escritor.',
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
    // Observabilidad honesta: el recall por IA registra su evento (cuenta a la
    // tasa de fallas del panel, no solo las capturas).
    expect(
      mockSqlResponses.calls.some(
        (c) =>
          /INSERT INTO whatsapp_events/i.test(c.template) && c.values.includes('recall'),
      ),
    ).toBe(true)
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
