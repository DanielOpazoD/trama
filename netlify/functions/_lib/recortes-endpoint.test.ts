import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApiRequest, buildJsonApiRequest, buildRecorteRow } from './test-fixtures'
import {
  expectCanonicalError,
  mockContext,
  mockSqlResponses,
  setupMockSql,
} from './test-utils'

vi.mock('./db.js', () => setupMockSql())
vi.mock('./embeddings.js', () => ({
  embedSafe: vi.fn(async () => ({ vector: [0.1, 0.2], model: 'test-embed' })),
  entityEmbeddingText: vi.fn((input) => `entity:${input.name}`),
  quoteEmbeddingText: vi.fn((input) => `quote:${input.text}:${input.entityName ?? ''}`),
  toPgVector: vi.fn((vector) => `[${vector.join(',')}]`),
}))

// Blobs: la promoción de una captura de imagen a Momento foto copia el blob de
// recortes-media a momentos-media. Mockeamos el store para inspeccionar la copia.
const { blobStore } = vi.hoisted(() => ({
  blobStore: {
    getWithMetadata: vi.fn(),
    set: vi.fn(),
  },
}))
vi.mock('@netlify/blobs', () => ({
  getStore: vi.fn(() => blobStore),
}))

import recortesHandler from '../recortes'
import tokensHandler from '../api-tokens'
import {
  embedSafe,
  entityEmbeddingText,
  quoteEmbeddingText,
  toPgVector,
} from './embeddings'
import {
  extensionCorsHeaders,
  extensionPreflight,
  withExtensionCors,
} from './extension-cors'

/** happy-dom descarta Origin/Authorization al construir Requests, así que
 *  el CORS y el guard de PAT se prueban con requests sintéticos. */
function fakeReq(method: string, headers: Record<string, string>): Request {
  return {
    method,
    url: 'http://localhost/api/api-tokens',
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as Request
}

/**
 * Endpoint de Recortes + tokens: CRUD, promoción, CORS de extensión y el
 * guard de PATs sobre la gestión de tokens. El SQL va mockeado (patrón
 * home-endpoint); lo que se verifica es el cableado HTTP: rutas, métodos,
 * validación Zod, shapes de respuesta y headers.
 */

const ROW = buildRecorteRow({
  id: '6f9619ff-8b86-4d01-b42d-00cf4fc964ff',
  text: 'La memoria es un taller.',
  source_url: 'https://example.com/x',
  source_title: 'El taller',
  source_author: null,
  note: null,
  image_url: null,
  image_key: null,
  capture_mode: 'citation',
  status: 'pending',
  promoted_target: null,
  promoted_id: null,
  captured_at: '2026-06-10T12:00:00.000Z',
  created_at: '2026-06-10T12:00:00.000Z',
  updated_at: '2026-06-10T12:00:00.000Z',
})

beforeEach(() => {
  mockSqlResponses.reset()
  vi.mocked(embedSafe).mockClear()
  vi.mocked(entityEmbeddingText).mockClear()
  vi.mocked(quoteEmbeddingText).mockClear()
  vi.mocked(toPgVector).mockClear()
  blobStore.getWithMetadata.mockReset()
  blobStore.set.mockReset()
})

describe('recortes endpoint', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('GET lista los recortes del usuario', async () => {
    mockSqlResponses.push([ROW])
    const res = await recortesHandler(buildApiRequest('/api/recortes'), mockContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].source_title).toBe('El taller')
  })

  it('GET normaliza status por contrato y mantiene fallback sin filtro para valores desconocidos', async () => {
    mockSqlResponses.push([ROW], [ROW])

    const promoted = await recortesHandler(
      buildApiRequest('/api/recortes', { query: { status: ' promoted ' } }),
      mockContext(),
    )
    const unknown = await recortesHandler(
      buildApiRequest('/api/recortes', { query: { status: 'inventado' } }),
      mockContext(),
    )

    expect(promoted.status).toBe(200)
    expect(unknown.status).toBe(200)
    const [promotedQuery, unknownQuery] = mockSqlResponses.calls
    expect(promotedQuery?.values).toContain('promoted')
    expect(unknownQuery?.values).toContain(null)
  })

  it('DELETE emite owner.mismatch cuando el id no pertenece al usuario', async () => {
    mockSqlResponses.push([])
    const res = await recortesHandler(
      buildApiRequest(`/api/recortes/${ROW.id}`, {
        method: 'DELETE',
        requestId: 'rid-recorte-delete',
      }),
      mockContext({ id: ROW.id }),
    )

    await expectCanonicalError(res, {
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'rid-recorte-delete',
    })
    const events = consoleLogSpy.mock.calls.map((call) => JSON.parse(call[0] as string))
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'owner.mismatch',
          category: 'operational',
          severity: 'warn',
          requestId: 'rid-recorte-delete',
          operation: 'recortes.delete',
          userId: 'legacy-single-user',
        }),
      ]),
    )
  })

  it('POST crea un recorte (201 con la fila creada)', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([ROW]) // insert
    const res = await recortesHandler(
      buildJsonApiRequest('/api/recortes', {
        method: 'POST',
        json: {
          text: 'La memoria es un taller.',
          sourceUrl: 'https://example.com/x',
          sourceTitle: 'El taller',
          capturedAt: '2026-06-10T12:00:00.000Z',
        },
      }),
      mockContext(),
    )
    expect(res.status).toBe(201)
    expect((await res.json()).source_title).toBe('El taller')
  })

  it('POST persiste captureMode e imageKey en el INSERT (Bloque B+)', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ ...ROW, capture_mode: 'region', image_key: 'u/abc.webp' }])
    const res = await recortesHandler(
      buildJsonApiRequest('/api/recortes', {
        method: 'POST',
        json: {
          text: 'Recorte visual de la página',
          captureMode: 'region',
          imageKey: 'u/abc.webp',
        },
      }),
      mockContext(),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.capture_mode).toBe('region')
    expect(body.image_key).toBe('u/abc.webp')
    // El INSERT debe llevar ambos valores interpolados (no NULL silencioso).
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO recortes/.test(c.template),
    )
    expect(insert).toBeTruthy()
    expect(insert?.values).toContain('region')
    expect(insert?.values).toContain('u/abc.webp')
  })

  it('POST rechaza captureMode fuera del enum (Zod)', async () => {
    const res = await recortesHandler(
      buildJsonApiRequest('/api/recortes', {
        method: 'POST',
        json: { text: 'x', captureMode: 'inventado' },
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('CORS: preflight 204 y headers solo para orígenes de extensión', () => {
    const pre = extensionPreflight(
      fakeReq('OPTIONS', { origin: 'chrome-extension://abc123' }),
    )
    expect(pre?.status).toBe(204)
    expect(pre?.headers.get('Access-Control-Allow-Origin')).toBe(
      'chrome-extension://abc123',
    )
    expect(pre?.headers.get('Access-Control-Allow-Methods')).toContain('POST')

    // Web normal: ni preflight ni headers (no es CORS global).
    expect(extensionPreflight(fakeReq('OPTIONS', { origin: 'https://evil.com' }))).toBe(
      null,
    )
    expect(extensionCorsHeaders(fakeReq('GET', { origin: 'https://evil.com' }))).toEqual(
      {},
    )

    const wrapped = withExtensionCors(
      fakeReq('POST', { origin: 'chrome-extension://abc123' }),
      Response.json({ ok: true }, { status: 201 }),
    )
    expect(wrapped.status).toBe(201)
    expect(wrapped.headers.get('Access-Control-Allow-Origin')).toBe(
      'chrome-extension://abc123',
    )
  })

  it('POST rechaza body inválido (Zod)', async () => {
    const res = await recortesHandler(
      buildJsonApiRequest('/api/recortes', {
        method: 'POST',
        json: { text: '   ' },
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('promote quote crea la cita y marca el recorte en un CTE idempotente', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ name: 'Borges' }]) // entity name for embedding context
    mockSqlResponses.push([{ ...ROW, status: 'promoted', promoted_target: 'quote' }])
    const ok = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'quote',
          quote: {
            entityId: '11111111-1111-4111-8111-111111111111',
            text: ROW.text,
            source: 'El taller',
            link: ROW.source_url,
          },
        }),
      }),
      mockContext({ id: ROW.id }),
    )
    expect(ok.status).toBe(200)
    expect((await ok.json()).status).toBe('promoted')
    const promoteCte = mockSqlResponses.calls.find((c) =>
      /INSERT INTO quotes/i.test(c.template),
    )
    expect(promoteCte?.template).toMatch(/UPDATE recortes/i)
    expect(promoteCte?.template).toMatch(/embedding, embedding_model, embedding_at/i)
    expect(promoteCte?.values).toContain(ROW.text)
    expect(quoteEmbeddingText).toHaveBeenCalledWith({
      text: ROW.text,
      entityName: 'Borges',
      source: 'El taller',
      context: null,
    })
    expect(toPgVector).toHaveBeenCalledWith([0.1, 0.2])

    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([]) // entity name unavailable, idempotent CTE still returns existing
    mockSqlResponses.push([
      {
        ...ROW,
        status: 'promoted',
        promoted_target: 'quote',
        promoted_id: '22222222-2222-4222-8222-222222222222',
      },
    ])
    const dup = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'quote',
          quote: {
            entityId: '11111111-1111-4111-8111-111111111111',
            text: ROW.text,
          },
        }),
      }),
      mockContext({ id: ROW.id }),
    )
    expect(dup.status).toBe(200)
    expect((await dup.json()).promoted_id).toBe('22222222-2222-4222-8222-222222222222')
  })

  it('promote entity y momento crean destino dentro del CTE de promoción', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ ...ROW, status: 'promoted', promoted_target: 'entity' }])
    const entity = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'entity',
          entity: {
            type: 'concepto',
            name: 'Memoria',
            description: 'La memoria es un taller.',
          },
        }),
      }),
      mockContext({ id: ROW.id }),
    )
    expect(entity.status).toBe(200)
    expect(
      mockSqlResponses.calls.some(
        (c) =>
          /INSERT INTO entities/i.test(c.template) &&
          /embedding, embedding_model, embedding_at/i.test(c.template) &&
          /UPDATE recortes/i.test(c.template),
      ),
    ).toBe(true)
    expect(entityEmbeddingText).toHaveBeenCalledWith({
      name: 'Memoria',
      type: 'concepto',
      year: null,
      description: 'La memoria es un taller.',
    })

    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ ...ROW, status: 'promoted', promoted_target: 'momento' }])
    const momento = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'momento',
          momento: {
            kind: 'recorte',
            payload: { bodyText: ROW.text, url: ROW.source_url },
            note: ROW.note,
            capturedAt: ROW.captured_at,
          },
        }),
      }),
      mockContext({ id: ROW.id }),
    )
    expect(momento.status).toBe(200)
    expect(
      mockSqlResponses.calls.some(
        (c) =>
          /INSERT INTO momentos/i.test(c.template) &&
          /embedding, embedding_model, embedding_at/i.test(c.template) &&
          /UPDATE recortes/i.test(c.template),
      ),
    ).toBe(true)
  })

  it('promote momento de una captura de imagen → kind:foto copiando el blob a momentos-media', async () => {
    const imageRow = { ...ROW, capture_mode: 'image', image_key: 'u/origen.webp' }
    blobStore.getWithMetadata.mockResolvedValue({
      data: new ArrayBuffer(8),
      metadata: { mime: 'image/webp', size: '8' },
    })
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ status: 'pending', image_key: 'u/origen.webp' }]) // SELECT status,image_key
    mockSqlResponses.push([]) // SELECT recorte_images (vacío → cae a image_key)
    mockSqlResponses.push([
      { ...imageRow, status: 'promoted', promoted_target: 'momento' },
    ]) // CTE insert momentos

    const res = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'momento',
          momento: { kind: 'foto', payload: { caption: 'mi gato' } },
        }),
      }),
      mockContext({ id: ROW.id }),
    )

    expect(res.status).toBe(200)
    // Leyó el blob de recortes-media y lo escribió en momentos-media.
    expect(blobStore.getWithMetadata).toHaveBeenCalledWith(
      'u/origen.webp',
      expect.anything(),
    )
    expect(blobStore.set).toHaveBeenCalledTimes(1)
    // El INSERT del momento usa kind 'foto' y un payload con storageKey nuevo.
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO momentos/i.test(c.template),
    )
    expect(insert?.values).toContain('foto')
    const payloadValue = insert?.values.find(
      (v): v is string => typeof v === 'string' && v.includes('"storageKey"'),
    )
    expect(payloadValue).toBeTruthy()
    expect(payloadValue).toContain('"caption":"mi gato"')
    // El storageKey copiado NO es la image_key del recorte (vive en otro store).
    expect(payloadValue).not.toContain('u/origen.webp')
  })

  it('promote momento foto de un recorte-evento → copia TODAS las imágenes a items[]', async () => {
    const imageRow = { ...ROW, capture_mode: 'image', image_key: 'u/portada.webp' }
    blobStore.getWithMetadata.mockResolvedValue({
      data: new ArrayBuffer(8),
      metadata: { mime: 'image/webp', size: '8' },
    })
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ status: 'pending', image_key: 'u/portada.webp' }]) // SELECT status,image_key
    mockSqlResponses.push([
      { storage_key: 'u/portada.webp' },
      { storage_key: 'u/segunda.webp' },
      { storage_key: 'u/tercera.webp' },
    ]) // SELECT recorte_images (evento de 3 fotos)
    mockSqlResponses.push([
      { ...imageRow, status: 'promoted', promoted_target: 'momento' },
    ]) // CTE insert momentos

    const res = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'momento',
          momento: { kind: 'foto', payload: { caption: 'mi gato' } },
        }),
      }),
      mockContext({ id: ROW.id }),
    )

    expect(res.status).toBe(200)
    // Copió los 3 blobs (uno por imagen del evento) a momentos-media.
    expect(blobStore.getWithMetadata).toHaveBeenCalledTimes(3)
    expect(blobStore.set).toHaveBeenCalledTimes(3)
    // El payload del momento usa items[] (episodio), no storageKey suelto.
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO momentos/i.test(c.template),
    )
    const payloadValue = insert?.values.find(
      (v): v is string => typeof v === 'string' && v.includes('"items"'),
    )
    expect(payloadValue).toBeTruthy()
    expect(payloadValue).toContain('"caption":"mi gato"')
    // Tres items, ninguno con las storage_key originales (viven en otro store).
    expect((payloadValue?.match(/"storageKey"/g) ?? []).length).toBe(3)
    expect(payloadValue).not.toContain('u/portada.webp')
  })

  it('promote momento foto sin imagen propia → 400 (no se puede armar la foto)', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([{ status: 'pending', image_key: null }]) // SELECT status,image_key

    const res = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'momento',
          momento: { kind: 'foto', payload: {} },
        }),
      }),
      mockContext({ id: ROW.id }),
    )

    expect(res.status).toBe(400)
    expect(blobStore.set).not.toHaveBeenCalled()
  })

  it('unpromote revierte: soft-borra el destino y devuelve el recorte a pending', async () => {
    mockSqlResponses.push([
      { ...ROW, status: 'pending', promoted_target: null, promoted_id: null },
    ])
    const res = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}/unpromote`, {
        method: 'POST',
      }),
      mockContext({ id: ROW.id }),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('pending')
    const cte = mockSqlResponses.calls.find((c) => /UPDATE recortes/i.test(c.template))
    // El CTE condiciona el borrado por target a una sola tabla y resetea el recorte.
    expect(cte?.template).toMatch(/UPDATE quotes SET deleted_at/i)
    expect(cte?.template).toMatch(/UPDATE entities SET deleted_at/i)
    expect(cte?.template).toMatch(/UPDATE momentos SET deleted_at/i)
    expect(cte?.template).toMatch(/promoted_target = NULL/i)
  })

  it('PATCH aplica el enriquecimiento OG (source_title/author/image vía COALESCE)', async () => {
    mockSqlResponses.push([
      {
        ...ROW,
        source_title: 'OG',
        source_author: 'Autor',
        image_url: 'https://i/x.jpg',
      },
    ])
    const res = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceTitle: 'OG',
          sourceAuthor: 'Autor',
          imageUrl: 'https://i/x.jpg',
        }),
      }),
      mockContext({ id: ROW.id }),
    )
    expect(res.status).toBe(200)
    const patch = mockSqlResponses.calls.find((c) => /UPDATE recortes/i.test(c.template))
    expect(patch?.template).toMatch(/source_title = COALESCE/i)
    expect(patch?.template).toMatch(/source_author = COALESCE/i)
    expect(patch?.template).toMatch(/image_url = COALESCE/i)
    expect(patch?.values).toContain('OG')
  })

  it('DELETE devuelve el deletedAt para Deshacer y restore lo consume', async () => {
    mockSqlResponses.push([{ deleted_at: '2026-06-11T10:00:00.000Z' }])
    const del = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}`, { method: 'DELETE' }),
      mockContext({ id: ROW.id }),
    )
    expect((await del.json()).deletedAt).toBe('2026-06-11T10:00:00.000Z')

    mockSqlResponses.push([{ restored: true }])
    const restore = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletedAt: '2026-06-11T10:00:00.000Z' }),
      }),
      mockContext({ id: ROW.id }),
    )
    expect((await restore.json()).restored).toBe(true)
  })

  it('DELETE inexistente o de otro usuario devuelve 404 canónico, no 200 no-op', async () => {
    mockSqlResponses.push([])
    const res = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}`, {
        method: 'DELETE',
        headers: { 'x-request-id': 'rid-recorte-delete' },
      }),
      mockContext({ id: ROW.id }),
    )

    await expectCanonicalError(res, {
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'rid-recorte-delete',
    })
  })

  it('restore con deletedAt inválido devuelve 404 canónico', async () => {
    mockSqlResponses.push([{ restored: false }])
    const res = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': 'rid-recorte-restore',
        },
        body: JSON.stringify({ deletedAt: '2026-06-11T10:00:00.000Z' }),
      }),
      mockContext({ id: ROW.id }),
    )

    await expectCanonicalError(res, {
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'rid-recorte-restore',
    })
  })

  it('unpromote inexistente o no promovido devuelve 404 canónico', async () => {
    mockSqlResponses.push([])
    const res = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}/unpromote`, {
        method: 'POST',
        headers: { 'x-request-id': 'rid-recorte-unpromote' },
      }),
      mockContext({ id: ROW.id }),
    )

    await expectCanonicalError(res, {
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'rid-recorte-unpromote',
    })
  })

  it('PATCH archiva y 404 cuando el recorte no existe', async () => {
    mockSqlResponses.push([{ ...ROW, status: 'archived' }])
    const ok = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      }),
      mockContext({ id: ROW.id }),
    )
    expect((await ok.json()).status).toBe('archived')

    mockSqlResponses.push([])
    const missing = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      }),
      mockContext({ id: ROW.id }),
    )
    await expectCanonicalError(missing, { status: 404, code: 'NOT_FOUND' })
  })
})

describe('api-tokens endpoint', () => {
  it('POST genera token (el claro viaja una sola vez) y GET no lo repite', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([
      {
        id: 't1',
        label: 'extensión de Chrome',
        created_at: '2026-06-11T10:00:00.000Z',
        last_used_at: null,
      },
    ])
    const created = await tokensHandler(
      new Request('http://localhost/api/api-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      mockContext(),
    )
    expect(created.status).toBe(201)
    const body = await created.json()
    expect(body.token).toMatch(/^trama_pat_/)

    mockSqlResponses.push([
      {
        id: 't1',
        label: 'extensión de Chrome',
        created_at: '2026-06-11T10:00:00.000Z',
        last_used_at: null,
      },
    ])
    const list = await tokensHandler(
      new Request('http://localhost/api/api-tokens'),
      mockContext(),
    )
    const rows = await list.json()
    expect(rows[0].token).toBeUndefined()
  })

  it('un PAT no puede gestionar tokens (guard anti-escalada)', async () => {
    const res = await tokensHandler(
      fakeReq('GET', { authorization: 'Bearer trama_pat_robado' }),
      mockContext(),
    )
    expect(res.status).toBe(401)
    // El guard corta ANTES de tocar api_tokens (la única query permitida
    // es el log de observabilidad del wrapper).
    const templates = mockSqlResponses.calls.map((c) => c.template).join('\n')
    expect(templates).not.toMatch(/api_tokens/)
  })

  it('DELETE revoca y 404 si ya estaba revocado', async () => {
    mockSqlResponses.push([{ id: 't1' }])
    const ok = await tokensHandler(
      new Request('http://localhost/api/api-tokens/t1', { method: 'DELETE' }),
      mockContext({ id: 't1' }),
    )
    expect((await ok.json()).ok).toBe(true)

    mockSqlResponses.push([])
    const gone = await tokensHandler(
      new Request('http://localhost/api/api-tokens/t1', { method: 'DELETE' }),
      mockContext({ id: 't1' }),
    )
    expect(gone.status).toBe(404)
  })
})
