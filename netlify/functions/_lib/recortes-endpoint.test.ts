import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import recortesHandler from '../recortes'
import tokensHandler from '../api-tokens'
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

const ROW = {
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
}

beforeEach(() => mockSqlResponses.reset())

describe('recortes endpoint', () => {
  it('GET lista los recortes del usuario', async () => {
    mockSqlResponses.push([ROW])
    const res = await recortesHandler(
      new Request('http://localhost/api/recortes'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].source_title).toBe('El taller')
  })

  it('POST crea un recorte (201 con la fila creada)', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([ROW]) // insert
    const res = await recortesHandler(
      new Request('http://localhost/api/recortes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'La memoria es un taller.',
          sourceUrl: 'https://example.com/x',
          sourceTitle: 'El taller',
          capturedAt: '2026-06-10T12:00:00.000Z',
        }),
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
      new Request('http://localhost/api/recortes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Recorte visual de la página',
          captureMode: 'region',
          imageKey: 'u/abc.webp',
        }),
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
      new Request('http://localhost/api/recortes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'x', captureMode: 'inventado' }),
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
      new Request('http://localhost/api/recortes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '   ' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('promote marca el recorte y 404 si ya estaba promovido', async () => {
    mockSqlResponses.push([{ ...ROW, status: 'promoted', promoted_target: 'quote' }])
    const ok = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'quote', promotedId: ROW.id }),
      }),
      mockContext({ id: ROW.id }),
    )
    expect(ok.status).toBe(200)
    expect((await ok.json()).status).toBe('promoted')

    mockSqlResponses.push([]) // segunda vez: el UPDATE no matchea
    const dup = await recortesHandler(
      new Request(`http://localhost/api/recortes/${ROW.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'quote', promotedId: ROW.id }),
      }),
      mockContext({ id: ROW.id }),
    )
    expect(dup.status).toBe(404)
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
    expect(missing.status).toBe(404)
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
