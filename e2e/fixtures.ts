import type { Page, Route } from '@playwright/test'

/**
 * Mock state que comparte la simulación del backend a través de un test.
 * Cada test puede modificar el estado entre acciones (e.g., agregar una
 * entidad mockeada después de un POST exitoso).
 */
export type MockState = {
  entities: Array<{
    id: string
    type: string
    name: string
    year: number | null
    description: string | null
    essay: string | null
    position_x: number | null
    position_y: number | null
    origin: { kind: string }
    spotify_url: string | null
    created_at: string
    updated_at: string
  }>
  quotes: Array<{
    id: string
    entity_id: string
    text: string
    source: string | null
    context: string | null
    user_reflection: string | null
    ai_reflection: string | null
    ai_reflection_provider: string | null
    ai_reflection_model: string | null
    ai_reflection_at: string | null
    linked_quote_ids: string[]
    origin: { kind: string }
    created_at: string
    updated_at: string
  }>
  relationships: Array<{
    id: string
    from_id: string
    to_id: string
    type: string
    notes: string | null
    origin: { kind: string }
    created_at: string
    updated_at: string
  }>
  chatThreads: Array<{
    id: string
    title: string | null
    context: string | null
    createdAt: string
    updatedAt: string
    messageCount: number
  }>
  chatMessages: Record<
    string,
    Array<{
      id: string
      role: 'user' | 'assistant'
      content: string
      proposal: unknown
      createdAt: string
      provider?: string
      model?: string
    }>
  >
}

export function emptyState(): MockState {
  return {
    entities: [],
    quotes: [],
    relationships: [],
    chatThreads: [],
    chatMessages: {},
  }
}

function jsonResp(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

/**
 * Helper: matchea sólo URLs cuyo `pathname` corresponde a `/api/<path>`. Sin
 * esto el glob `**​/api/**` matchea también `/src/api/index.ts` (los assets
 * que Vite sirve después de BB2 split de src/api.ts → src/api/), y devuelve
 * JSON cuando el browser pidió un módulo JS. La app queda en blanco.
 *
 * - apiPath('entities')                 → exact match /api/entities
 * - apiPath('quotes', { prefix: true }) → /api/quotes, /api/quotes/foo, etc.
 */
function apiPath(path: string, opts?: { prefix?: boolean }) {
  const target = `/api/${path}`
  return (url: URL) =>
    opts?.prefix ? url.pathname.startsWith(target) : url.pathname === target
}

/**
 * Registra route handlers para todos los endpoints que la app llama al
 * arrancar. Cualquier endpoint no listado responde 200 con `[]` para
 * que la app no se cuelgue.
 */
export async function mockBackend(page: Page, state: MockState) {
  // IMPORTANTE: Playwright matchea routes en orden REVERSO de registro.
  // Por eso registramos primero el catch-all (último en matchear) y al
  // final los handlers específicos (primeros en matchear).
  //
  // Catch-all para cualquier /api no listado: 200 con array vacío. Evita
  // que un endpoint olvidado bloquee el test entero.
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => jsonResp(route, []),
  )

  // GET /api/entities (wholesale)
  await page.route(apiPath('entities'), async (route) => {
    const url = new URL(route.request().url())
    const limitParam = url.searchParams.get('limit')
    if (limitParam) {
      const limit = Number.parseInt(limitParam, 10) || 50
      const items = state.entities.slice(0, limit)
      return jsonResp(route, { items, nextCursor: null })
    }
    if (route.request().method() === 'POST') {
      const payload = JSON.parse(route.request().postData() ?? '{}')
      const created = {
        id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: payload.type,
        name: payload.name,
        year: payload.year ?? null,
        description: payload.description ?? null,
        essay: payload.essay ?? null,
        position_x: payload.position_x ?? null,
        position_y: payload.position_y ?? null,
        origin: payload.origin ?? { kind: 'manual' },
        spotify_url: payload.spotify_url ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      state.entities.unshift(created)
      return jsonResp(route, created, 201)
    }
    return jsonResp(route, state.entities)
  })

  // GET /api/relationships
  await page.route(apiPath('relationships', { prefix: true }), async (route) => {
    const url = new URL(route.request().url())
    const limitParam = url.searchParams.get('limit')
    if (limitParam) {
      const limit = Number.parseInt(limitParam, 10) || 50
      const items = state.relationships.slice(0, limit)
      return jsonResp(route, { items, nextCursor: null })
    }
    return jsonResp(route, state.relationships)
  })

  // GET /api/quotes (paginated when limit; wholesale otherwise) + POST
  await page.route(apiPath('quotes', { prefix: true }), async (route) => {
    if (route.request().method() === 'POST') {
      const payload = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
      const created = {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        // La API manda snake_case en el body POST (entity_id).
        entity_id: ((payload['entity_id'] ?? payload['entityId']) as string | undefined) ?? '',
        text: payload['text'] as string,
        source: (payload['source'] as string | undefined) ?? null,
        context: (payload['context'] as string | undefined) ?? null,
        user_reflection: (payload['userReflection'] as string | undefined) ?? null,
        ai_reflection: null,
        ai_reflection_provider: null,
        ai_reflection_model: null,
        ai_reflection_at: null,
        linked_quote_ids: [],
        origin: (payload.origin as { kind: string } | undefined) ?? { kind: 'manual' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      state.quotes.unshift(created)
      return jsonResp(route, created, 201)
    }
    const url = new URL(route.request().url())
    const limitParam = url.searchParams.get('limit')
    if (limitParam) {
      const limit = Number.parseInt(limitParam, 10) || 50
      const items = state.quotes.slice(0, limit)
      return jsonResp(route, { items, nextCursor: null })
    }
    return jsonResp(route, state.quotes)
  })

  // /api/counts
  await page.route(apiPath('counts'), (route) =>
    jsonResp(route, {
      entities: state.entities.length,
      quotes: state.quotes.length,
      relationships: state.relationships.length,
      momentos: 0,
    }),
  )

  // /api/search (hybrid). Devuelve hits que coincidan por substring en nombre.
  await page.route(apiPath('search', { prefix: true }), (route) => {
    const url = new URL(route.request().url())
    const q = (url.searchParams.get('q') ?? '').toLowerCase()
    const hits = state.entities
      .filter((e) => e.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((e, i) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        description: e.description,
        year: e.year,
        score: 1 / (i + 1),
        lexicalRank: i + 1,
        semanticRank: null,
        lexical: 0,
        semantic: 0,
      }))
    return jsonResp(route, { entities: hits, quotes: [], mode: 'hybrid' })
  })

  // /api/entities-lookup (devuelve por prefix matching)
  await page.route(apiPath('entities-lookup', { prefix: true }), (route) => {
    const url = new URL(route.request().url())
    const prefix = (url.searchParams.get('prefix') ?? '').toLowerCase()
    const name = (url.searchParams.get('name') ?? '').toLowerCase()
    let hits = state.entities
    if (prefix) hits = hits.filter((e) => e.name.toLowerCase().startsWith(prefix))
    if (name) hits = hits.filter((e) => e.name.toLowerCase() === name)
    return jsonResp(route, hits.slice(0, 10))
  })

  // /api/proactive-suggestions (sin sugerencias)
  await page.route(apiPath('proactive-suggestions', { prefix: true }), (route) =>
    jsonResp(route, []),
  )

  // /api/ai-settings (sin overrides)
  await page.route(apiPath('ai-settings'), (route) =>
    jsonResp(route, { providers: [] }),
  )

  // /api/extraction-log (vacío)
  await page.route(apiPath('extraction-log', { prefix: true }), (route) =>
    jsonResp(route, { entries: [], totals: { totalCalls: 0, totalCostCents: 0, totalTokens: 0 } }),
  )

  // /api/error-log y /api/health (vacíos)
  await page.route(apiPath('error-log', { prefix: true }), (route) => jsonResp(route, []))
  await page.route(apiPath('health'), (route) =>
    jsonResp(route, {
      counts: {
        entities: state.entities.length,
        quotes: state.quotes.length,
        relationships: state.relationships.length,
      },
      month: { calls: 0, tokensIn: 0, tokensOut: 0, costCents: 0 },
      budget: { limitCents: 5000, remainingCents: 5000, pct: 0 },
      byProvider: [],
      recentErrors: [],
    }),
  )

  // /api/spotify-status (no conectado)
  await page.route(apiPath('spotify', { prefix: true }), (route) =>
    jsonResp(route, { connected: false }),
  )

  // /api/chat/threads (GET + POST)
  await page.route(apiPath('chat/threads'), (route) => {
    if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}')
      const thread = {
        id: `t-${Date.now()}`,
        title: body.title ?? null,
        context: body.context ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0,
      }
      state.chatThreads.unshift(thread)
      state.chatMessages[thread.id] = []
      return jsonResp(route, thread, 201)
    }
    return jsonResp(route, state.chatThreads)
  })

  // /api/chat/threads/:id/messages (GET only — SSE skipped in fixture; tests
  // que necesiten send mocking can override per-test).
  // Regex anchored al inicio del pathname para no matchear /src/api/... por accidente.
  await page.route(
    (url) => /^\/api\/chat\/threads\/[^/]+\/messages$/.test(url.pathname),
    (route) => {
    if (route.request().method() === 'GET') {
      const match = route.request().url().match(/threads\/([^/]+)\/messages/)
      const threadId = match?.[1] ?? ''
      return jsonResp(route, state.chatMessages[threadId] ?? [])
    }
    // POST con SSE: simulamos el stream con un cuerpo SSE válido.
    const body = JSON.parse(route.request().postData() ?? '{}')
    const match = route.request().url().match(/threads\/([^/]+)\/messages/)
    const threadId = match?.[1] ?? ''
    const userId = `u-${Date.now()}`
    const assistantId = `a-${Date.now()}`
    const userMsg = {
      id: userId,
      role: 'user' as const,
      content: body.content,
      proposal: null,
      createdAt: new Date().toISOString(),
    }
    const assistantMsg = {
      id: assistantId,
      role: 'assistant' as const,
      content: 'Hola, te leo. (respuesta mock)',
      proposal: null,
      createdAt: new Date().toISOString(),
      provider: 'mock',
      model: 'mock-1',
    }
    state.chatMessages[threadId] = [...(state.chatMessages[threadId] ?? []), userMsg, assistantMsg]
    const sseBody = [
      `event: user\ndata: ${JSON.stringify(userMsg)}\n\n`,
      `event: chunk\ndata: ${JSON.stringify({ content: assistantMsg.content })}\n\n`,
      `event: done\ndata: ${JSON.stringify({ assistantMessage: assistantMsg })}\n\n`,
    ].join('')
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseBody,
    })
  })

}
