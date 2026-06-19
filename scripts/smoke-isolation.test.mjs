import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'

const PRELOAD = `
let entitySeq = 0
let quoteSeq = 0
let noteSeq = 0
let recorteSeq = 0
let momentoSeq = 0
const state = {
  entities: [],
  quotes: [],
  notes: [],
  recortes: [],
  momentos: [],
  attachments: [],
}

function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function requestBody(init) {
  if (!init?.body || typeof init.body !== 'string') return {}
  return JSON.parse(init.body)
}

globalThis.fetch = async (rawUrl, init = {}) => {
  const url = new URL(String(rawUrl))
  const path = url.pathname
  const method = init.method ?? 'GET'
  const auth = init.headers?.authorization ?? init.headers?.Authorization ?? null
  const isA = auth === 'Bearer token-a'
  const isB = auth === 'Bearer token-b'
  const isRevoked = auth === 'Bearer token-revoked'

  if (!auth || isRevoked) return json(401, { error: { code: 'UNAUTHENTICATED' } })

  if (method === 'POST' && path === '/api/entities') {
    const body = await requestBody(init)
    const row = { id: 'entity-' + ++entitySeq, name: body.name, type: body.type }
    state.entities.push(row)
    return json(201, row)
  }
  if (method === 'GET' && path === '/api/entities') {
    if (isB) return json(200, [])
    return json(200, process.env.MOCK_ENTITY_LOST_AFTER_B_DELETE === '1' ? [] : state.entities)
  }
  if (path.startsWith('/api/entities/')) {
    if (isB && method === 'GET') return json(404, { error: { code: 'NOT_FOUND' } })
    if (isB && method === 'PATCH') return json(404, { error: { code: 'NOT_FOUND' } })
    if (isB && method === 'DELETE') {
      if (process.env.MOCK_ENTITY_B_DELETE_200 === '1') return json(200, { ok: true })
      return json(404, { error: { code: 'NOT_FOUND' } })
    }
    if (isA && method === 'DELETE') return json(200, { ok: true })
  }

  if (method === 'POST' && path === '/api/quotes') {
    const body = await requestBody(init)
    const row = { id: 'quote-' + ++quoteSeq, text: body.text, entity_id: body.entity_id }
    state.quotes.push(row)
    return json(201, row)
  }
  if (method === 'GET' && path === '/api/quotes') return json(200, isB ? { items: [] } : { items: state.quotes })
  if (path.startsWith('/api/quotes/')) {
    if (isB && method === 'PATCH') return json(404, { error: { code: 'NOT_FOUND' } })
    if (isB && method === 'DELETE') return json(404, { error: { code: 'NOT_FOUND' } })
    if (isA && method === 'DELETE') return json(200, { ok: true })
  }

  if (method === 'GET' && path === '/api/search') return json(200, { items: [] })

  if (method === 'POST' && path === '/api/recortes') {
    const body = await requestBody(init)
    const row = { id: 'recorte-' + ++recorteSeq, text: body.text, status: 'pending' }
    state.recortes.push(row)
    return json(201, row)
  }
  if (method === 'GET' && path === '/api/recortes') {
    if (isB) {
      return json(200, process.env.MOCK_RECORTE_LEAKS_TO_B === '1' ? state.recortes : [])
    }
    return json(200, state.recortes)
  }
  if (path.startsWith('/api/recortes/')) {
    if (isB && method === 'PATCH') return json(404, { error: { code: 'NOT_FOUND' } })
    if (isB && method === 'DELETE') return json(404, { error: { code: 'NOT_FOUND' } })
    if (isA && method === 'DELETE') return json(200, { ok: true })
  }

  if (method === 'POST' && path === '/api/notes') {
    const body = await requestBody(init)
    const row = { id: 'note-' + ++noteSeq, title: body.title, content: body.content }
    state.notes.push(row)
    return json(201, row)
  }
  if (method === 'GET' && path === '/api/notes') return json(200, isB ? [] : state.notes)
  if (path.startsWith('/api/notes/')) {
    if (isB && method === 'PATCH') return json(404, { error: { code: 'NOT_FOUND' } })
    if (isB && method === 'DELETE') return json(404, { error: { code: 'NOT_FOUND' } })
    if (isA && method === 'DELETE') return json(200, { ok: true })
  }
  if (method === 'GET' && path === '/api/notas-feed') return json(200, { items: [] })

  if (method === 'POST' && path === '/api/notas-attachments-upload') {
    const row = { id: 'attachment-1', storage_key: 'user-a/attachment-1.txt' }
    state.attachments.push(row)
    return json(201, row)
  }
  if (method === 'GET' && path === '/api/notas-attachments') {
    if (isB) return json(404, { error: { code: 'NOT_FOUND' } })
    return json(200, state.attachments)
  }
  if (path.startsWith('/api/notas-attachments-file/')) {
    if (isB) return json(404, { error: { code: 'NOT_FOUND' } })
    return new Response('ok', { status: 200 })
  }
  if (path.startsWith('/api/notas-attachments/')) {
    if (isB && method === 'DELETE') return json(404, { error: { code: 'NOT_FOUND' } })
    if (isA && method === 'DELETE') return json(200, { ok: true })
  }

  if (method === 'POST' && path === '/api/momentos') {
    const body = await requestBody(init)
    const row = { id: 'momento-' + ++momentoSeq, payload: body.payload }
    state.momentos.push(row)
    return json(201, row)
  }
  if (method === 'GET' && path === '/api/momentos') return json(200, isB ? [] : state.momentos)
  if (path.startsWith('/api/momentos/')) {
    if (isB && method === 'GET') return json(404, { error: { code: 'NOT_FOUND' } })
    if (isB && method === 'PATCH') return json(404, { error: { code: 'NOT_FOUND' } })
    if (isB && method === 'DELETE') return json(404, { error: { code: 'NOT_FOUND' } })
    if (isA && method === 'DELETE') return json(200, { ok: true })
  }

  return json(500, { error: { code: 'UNMOCKED', path, method } })
}
`

function runSmoke(extraEnv = {}) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      `data:text/javascript,${encodeURIComponent(PRELOAD)}`,
      'scripts/smoke-isolation.mjs',
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...extraEnv,
        SMOKE_BASE_URL: 'https://example.test',
        SMOKE_TOKEN_A: 'token-a',
        SMOKE_TOKEN_B: 'token-b',
        SMOKE_REVOKED_TOKEN: 'token-revoked',
      },
      encoding: 'utf8',
    },
  )
}

describe('smoke-isolation script', () => {
  it('imprime un resumen compacto de los contratos operacionales', () => {
    const result = runSmoke()

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('· Recortes')
    expect(result.stdout).toContain('anonymous_401: ok')
    expect(result.stdout).toContain('revoked_401: ok')
    expect(result.stdout).toContain('read_isolation: ok')
    expect(result.stdout).toContain('mutation_isolation: ok')
    expect(result.stdout).toContain('blob_isolation: ok')
  })

  it('falla si DELETE de B devuelve 200 aunque A conserve su fixture', () => {
    const result = runSmoke({ MOCK_ENTITY_B_DELETE_200: '1' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'Entidades: DELETE de B debe rechazarse explícitamente',
    )
  })

  it('falla si el recorte de A aparece en la lista de B', () => {
    const result = runSmoke({ MOCK_RECORTE_LEAKS_TO_B: '1' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Recortes: B NO debe ver fixture de A')
  })
})
