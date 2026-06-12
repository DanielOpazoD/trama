import type { Row, Store } from './demoTypes'
import { saveDemoStore as save } from './demoStore'
import { extractPromptVariables, parseTags, weekStartAgo } from './demoUtils'

function uid(): string {
  return crypto.randomUUID()
}
function nowIso(): string {
  return new Date().toISOString()
}
// ---------- Router ----------

const live = (rows: Row[]): Row[] => rows.filter((r) => !r.deleted_at)

/** GET de colección: array plano, o `{items,nextCursor}` si hay paginación. */
function listOrPage(rows: Row[], params: URLSearchParams): unknown {
  const items = live(rows)
  if (params.has('limit') || params.has('cursor')) {
    return { items, nextCursor: null }
  }
  return items
}

function findLive(rows: Row[], id: string): Row | undefined {
  return rows.find((r) => r.id === id && !r.deleted_at)
}

function aiOff(): never {
  throw new Error('La IA está desactivada en el modo prueba.')
}

/** Maneja una "request" contra el store. Devuelve el shape del servidor. */
export function routeDemoRequest(
  method: string,
  path: string,
  params: URLSearchParams,
  body: Record<string, unknown>,
  store: Store,
): unknown {
  const seg = path.replace(/^\/api\//, '').split('/')
  const resource = seg[0] ?? ''
  const id = seg[1]
  const action = seg[2]

  if (resource === 'notas-attachments-upload' && method === 'POST') {
    const ownerType = body.ownerType as string
    const ownerId = body.ownerId as string
    const file = body.file as File | undefined
    const fileName = file?.name ?? 'archivo'
    const mimeType = file?.type || 'application/octet-stream'
    const byteSize = file?.size
    const row: Row = {
      id: uid(),
      owner_type: ownerType,
      owner_id: ownerId,
      file_name: fileName,
      mime_type: mimeType,
      byte_size: Number.isFinite(byteSize) ? Number(byteSize) : 0,
      storage_key: `legacy-single-user/demo-${uid()}`,
      created_at: nowIso(),
      updated_at: nowIso(),
      deleted_at: null,
    }
    store.notas_attachments.push(row)
    save(store)
    return row
  }

  if (resource === 'user-prefs') {
    if (method === 'GET') return store.user_prefs ?? {}
    if (method === 'PUT') {
      // Merge superficial (espejo del `jsonb ||` del backend).
      store.user_prefs = { ...(store.user_prefs ?? {}), ...(body as object) }
      save(store)
      return store.user_prefs
    }
  }

  if (resource === 'month-notes') {
    const catOf = (v: unknown) => (v === 'personal' ? 'personal' : 'trabajo')
    if (method === 'GET') {
      const month = params.get('month') ?? ''
      const category = catOf(params.get('category'))
      const row = store.month_notes.find(
        (r) => r.month_key === month && catOf(r.category) === category && !r.deleted_at,
      )
      return { monthKey: month, content: (row?.content as string) ?? '', category }
    }
    if (method === 'PUT') {
      const month = String(body.month ?? '')
      const content = String(body.content ?? '')
      const category = catOf(body.category)
      const row = store.month_notes.find(
        (r) => r.month_key === month && catOf(r.category) === category && !r.deleted_at,
      )
      if (row) {
        row.content = content
        row.category = category
        row.updated_at = nowIso()
      } else {
        store.month_notes.push({
          id: uid(),
          user_id: 'legacy-single-user',
          month_key: month,
          category,
          content,
          created_at: nowIso(),
          updated_at: nowIso(),
          deleted_at: null,
        })
      }
      save(store)
      return { monthKey: month, content, category }
    }
  }

  // ---- recursos manuales con CRUD ----
  // Banco de pruebas del grafo: con `trama-demo-graph-bench = N` en
  // localStorage, entidades y relaciones se sirven SINTÉTICAS (N nodos,
  // ~2.5N aristas con hubs realistas) para ejercitar el renderer WebGL
  // y el layout en worker a miles de conexiones. Solo lectura del grafo;
  // el resto de la demo sigue con el store normal.
  const bench = graphBenchData()
  const collections: Record<string, Row[] | undefined> = {
    entities: bench?.entities ?? store.entities,
    relationships: bench?.relationships ?? store.relationships,
    quotes: store.quotes,
    momentos: store.momentos,
    notes: store.notes,
    tasks: store.tasks,
    prompts: store.prompts,
    secrets: store.secrets,
    'notas-attachments': store.notas_attachments,
    recortes: store.recortes,
    favoritos: store.favoritos,
  }
  const rows = collections[resource]

  if (resource === 'momentos-feedback' && id) {
    const readable = live(store.momentos).some((m) => m.id === id)
    if (!readable) return { comments: [], reactions: [] }

    const summarizeHeart = () => {
      const active = live(store.momento_reactions).filter(
        (r) => r.momento_id === id && r.reaction === 'heart',
      )
      return active.length > 0
        ? [{ reaction: 'heart', count: active.length, reactedByMe: true }]
        : []
    }
    const commentsForMomento = () =>
      live(store.momento_comments)
        .filter((c) => c.momento_id === id)
        .map((c) => ({
          id: c.id,
          momentoId: c.momento_id,
          authorUserId: c.user_id ?? 'legacy-single-user',
          authorDisplayName: c.author_display_name ?? 'Modo prueba',
          authorEmail: c.author_email ?? undefined,
          body: c.body,
          canDelete: true,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        }))

    if (method === 'GET') {
      return { comments: commentsForMomento(), reactions: summarizeHeart() }
    }
    if (method === 'POST') {
      const text = String(body.body ?? '')
        .trim()
        .slice(0, 500)
      if (!text) return { comment: null }
      const row: Row = {
        id: uid(),
        momento_id: id,
        user_id: 'legacy-single-user',
        author_display_name: 'Modo prueba',
        body: text,
        created_at: nowIso(),
        updated_at: nowIso(),
        deleted_at: null,
      }
      store.momento_comments.push(row)
      save(store)
      return { comment: commentsForMomento().find((c) => c.id === row.id) }
    }
    if (method === 'PUT') {
      const existing = store.momento_reactions.find(
        (r) =>
          r.momento_id === id &&
          r.user_id === 'legacy-single-user' &&
          r.reaction === 'heart',
      )
      if (existing) {
        existing.deleted_at = null
        existing.updated_at = nowIso()
      } else {
        store.momento_reactions.push({
          id: uid(),
          momento_id: id,
          user_id: 'legacy-single-user',
          reaction: 'heart',
          created_at: nowIso(),
          updated_at: nowIso(),
          deleted_at: null,
        })
      }
      save(store)
      return {
        reaction: summarizeHeart()[0] ?? {
          reaction: 'heart',
          count: 0,
          reactedByMe: true,
        },
      }
    }
    if (method === 'DELETE') {
      const commentId = params.get('commentId')
      if (params.get('reaction') === 'heart') {
        for (const r of store.momento_reactions) {
          if (
            r.momento_id === id &&
            r.user_id === 'legacy-single-user' &&
            r.reaction === 'heart' &&
            !r.deleted_at
          ) {
            r.deleted_at = nowIso()
            r.updated_at = nowIso()
          }
        }
        save(store)
        return { reaction: { reaction: 'heart', reactedByMe: false } }
      }
      if (commentId) {
        const comment = store.momento_comments.find((c) => c.id === commentId)
        if (comment) {
          comment.deleted_at = nowIso()
          comment.updated_at = nowIso()
          save(store)
        }
        return { deleted: Boolean(comment) }
      }
    }
  }

  if (rows) {
    // Sub-acciones especiales
    if (resource === 'notes' && id && action === 'promote' && method === 'POST') {
      const n = findLive(store.notes, id)
      if (!n) throw new Error('Nota no encontrada')
      const momentoId = uid()
      store.momentos.push({
        id: momentoId,
        kind: 'nota',
        captured_at: (n.created_at as string) ?? nowIso(),
        payload: { bodyText: n.content as string },
        note: null,
        origin: { kind: 'manual' },
        entity_ids: [],
        created_at: nowIso(),
        updated_at: nowIso(),
      })
      n.promoted_momento_id = momentoId
      n.updated_at = nowIso()
      save(store)
      return { momentoId }
    }
    if (resource === 'recortes' && id && action === 'suggest' && method === 'POST') {
      aiOff()
    }
    if (resource === 'recortes' && id && action === 'promote' && method === 'POST') {
      const r = findLive(store.recortes, id)
      if (!r) throw new Error('Recorte no encontrado')
      r.status = 'promoted'
      r.promoted_target = (body as { target?: string }).target ?? null
      r.promoted_id = (body as { promotedId?: string }).promotedId ?? null
      r.updated_at = nowIso()
      save(store)
      return r
    }
    if (resource === 'quotes' && id && action === 'reflect') aiOff()
    if (resource === 'quotes' && id && action === 'echoes') return []
    if (resource === 'prompts' && id && action === 'duplicate' && method === 'POST') {
      const p = findLive(store.prompts, id)
      if (!p) throw new Error('Prompt no encontrado')
      const row = {
        ...p,
        id: uid(),
        title: `${p.title as string} copia`,
        favorite: false,
        use_count: 0,
        last_used_at: null,
        created_at: nowIso(),
        updated_at: nowIso(),
        deleted_at: null,
      }
      store.prompts.push(row)
      save(store)
      return row
    }
    if (resource === 'prompts' && id && action === 'use' && method === 'POST') {
      const p = findLive(store.prompts, id)
      if (!p) throw new Error('Prompt no encontrado')
      p.use_count = Number(p.use_count ?? 0) + 1
      p.last_used_at = nowIso()
      p.updated_at = nowIso()
      save(store)
      return p
    }
    if (resource === 'secrets' && id && action === 'reveal' && method === 'GET') {
      const s = findLive(store.secrets, id)
      if (!s) throw new Error('Clave no encontrada')
      return { secret: s.secret_value ?? '' }
    }
    if (resource === 'secrets' && id && action === 'copied' && method === 'POST') {
      const s = findLive(store.secrets, id)
      if (!s) throw new Error('Clave no encontrada')
      s.copied_at = nowIso()
      s.updated_at = nowIso()
      save(store)
      return { ok: true }
    }
    if (id && action === 'restore' && method === 'POST') {
      const r = (store[resource as keyof Store] as Row[]).find((x) => x.id === id)
      if (r) {
        delete r.deleted_at
        r.updated_at = nowIso()
        save(store)
      }
      return { restored: true }
    }

    // Tareas: enriquecer cada fila con has_photos (espejo del EXISTS del backend).
    if (resource === 'tasks' && method === 'GET' && !id) {
      return live(rows).map((t) => ({
        ...t,
        has_photos: store.notas_attachments.some(
          (a) => a.owner_type === 'task' && a.owner_id === t.id && !a.deleted_at,
        ),
      }))
    }

    // Notas: enriquecer con has_images (espejo del EXISTS image/% del backend).
    if (resource === 'notes' && method === 'GET' && !id) {
      return live(rows).map((n) => ({
        ...n,
        has_images: store.notas_attachments.some(
          (a) =>
            a.owner_type === 'note' &&
            a.owner_id === n.id &&
            typeof a.mime_type === 'string' &&
            a.mime_type.startsWith('image/') &&
            !a.deleted_at,
        ),
      }))
    }

    // CRUD estándar
    if (method === 'GET' && !id) return listOrPage(rows, params)
    if (method === 'GET' && id) {
      const r = findLive(rows, id)
      if (!r) throw new Error('No encontrado')
      return r
    }
    if (method === 'POST' && !id) {
      const tagsSource =
        resource === 'notes'
          ? ((body.content as string) ?? '')
          : resource === 'tasks'
            ? `${(body.title as string) ?? ''}\n${(body.detail as string) ?? ''}`
            : resource === 'prompts'
              ? `${(body.title as string) ?? ''}\n${(body.content as string) ?? ''}\n${(body.collection as string) ?? ''}`
              : ''
      const row: Row = {
        id: uid(),
        created_at: nowIso(),
        updated_at: nowIso(),
        deleted_at: null,
        ...body,
        ...(resource === 'notes' || resource === 'tasks' || resource === 'prompts'
          ? { tags: parseTags(tagsSource) }
          : {}),
        ...(resource === 'prompts'
          ? {
              variables: extractPromptVariables((body.content as string) ?? ''),
              favorite: Boolean(body.favorite),
              use_count: 0,
              last_used_at: null,
            }
          : {}),
        ...(resource === 'secrets'
          ? {
              secret_value: body.secret,
              secret: undefined,
              kind: body.kind ?? 'other',
              favorite: Boolean(body.favorite),
              critical: Boolean(body.critical),
              expires_at: body.expiresAt ?? null,
              last_rotated_at: body.lastRotatedAt ?? null,
              copied_at: null,
            }
          : {}),
        ...(resource === 'momentos'
          ? { captured_at: (body.captured_at as string) || nowIso() }
          : {}),
        ...(resource === 'notes' ? { promoted_momento_id: null } : {}),
        ...(resource === 'tasks'
          ? {
              done: false,
              completed_at: null,
              due_date: (body.dueDate as string) ?? null,
              priority: (body.priority as string) ?? 'media',
              week_start: (body.weekStart as string) ?? weekStartAgo(0),
              category: (body.category as string) ?? 'trabajo',
            }
          : {}),
      }
      rows.push(row)
      save(store)
      return row
    }
    if (method === 'PATCH' && id) {
      const r = findLive(rows, id)
      if (!r) throw new Error('No encontrado')
      Object.assign(r, body)
      // Re-derivar tags y completed_at como el servidor.
      if (resource === 'notes' && typeof body.content === 'string') {
        r.tags = parseTags(body.content)
      }
      if (resource === 'tasks') {
        if (typeof body.title === 'string' || typeof body.detail === 'string') {
          r.tags = parseTags(`${r.title as string}\n${(r.detail as string) ?? ''}`)
        }
        if (body.done === true) r.completed_at = nowIso()
        if (body.done === false) r.completed_at = null
      }
      if (resource === 'prompts') {
        if (
          typeof body.title === 'string' ||
          typeof body.content === 'string' ||
          body.collection !== undefined
        ) {
          r.tags = parseTags(
            `${r.title as string}\n${r.content as string}\n${(r.collection as string | null) ?? ''}`,
          )
          r.variables = extractPromptVariables((r.content as string) ?? '')
        }
      }
      if (resource === 'secrets') {
        if (typeof body.secret === 'string') {
          r.secret_value = body.secret
          delete r.secret
        }
        if (body.expiresAt !== undefined) r.expires_at = body.expiresAt
        if (body.lastRotatedAt !== undefined) r.last_rotated_at = body.lastRotatedAt
      }
      r.updated_at = nowIso()
      save(store)
      return r
    }
    if (method === 'DELETE' && id) {
      const r = rows.find((x) => x.id === id)
      if (r) {
        r.deleted_at = nowIso()
        save(store)
      }
      // El deletedAt REAL de la fila (no un timestamp nuevo): es el token que
      // el toast de Deshacer manda de vuelta al restore. notes/tasks/prompts
      // lo devuelven junto al {ok} (espejo del backend post-undo-global);
      // secrets/attachments siguen sin undo (sensibles / sin restore).
      if (resource === 'secrets' || resource === 'notas-attachments') {
        return { ok: true }
      }
      if (resource === 'notes' || resource === 'tasks' || resource === 'prompts') {
        return { ok: true, deletedAt: r?.deleted_at ?? null }
      }
      return { deletedAt: r?.deleted_at ?? nowIso() }
    }
  }

  // ---- IA desactivada en demo ----
  if (
    [
      'extract',
      'extract-from-image',
      'ask',
      'suggest-relationships',
      'reclassify-entities',
    ].includes(resource) ||
    (resource === 'atlas' && action === 'generate') ||
    (resource === 'cronicas' && method === 'POST')
  ) {
    aiOff()
  }

  // ---- lecturas auxiliares (canned, para que las vistas rendericen) ----
  switch (resource) {
    case 'cronologia':
      return { entradas: [], nextCursor: null }
    case 'atlas':
      return {
        generatedAt: null,
        entityCount: 0,
        provider: null,
        model: null,
        clusters: [],
      }
    case 'cronicas':
      return []
    case 'ai-settings':
      return { defaultProvider: 'demo', visionDefaultProvider: null, tasks: [] }
    case 'proactive-suggestions':
      return []
    case 'search':
      return {
        entities: [],
        quotes: [],
        momentos: [],
        cronicas: [],
        chat: [],
        mode: 'lexical',
      }
    case 'wikipedia':
      // El buscador de Wikipedia necesita red real; en demo devuelve vacío.
      return { results: [] }
    case 'wikipedia-suggest':
      // Las sugerencias en lote también necesitan red real; demo no propone.
      return { suggestions: [], remaining: false }
    case 'entities-duplicates':
      // El seed no tiene duplicados; sin similitud real en demo.
      return { groups: [], embeddingSkipped: false }
    case 'entities-merge': {
      // Inalcanzable en demo (sin grupos), pero devolvemos algo coherente.
      const keep = findLive(store.entities, (body.keepId as string) ?? '')
      return keep ?? { ok: true }
    }
    case 'health':
      return {
        counts: {
          entities: live(store.entities).length,
          quotes: live(store.quotes).length,
          relationships: live(store.relationships).length,
        },
        month: { calls: 0, tokensIn: 0, tokensOut: 0, costCents: 0 },
        budget: { limitCents: 0, remainingCents: 0, pct: 0 },
        byProvider: [],
        recentErrors: [],
        alerts: [],
        embeddings: { pendingEntities: 0, pendingQuotes: 0 },
        dailyCost: [],
      }
    case 'extraction-log':
      return { items: [] }
    case 'error-log':
      return []
    case 'api-tokens':
      // Panel "Conectar extensión" en demo: token de mentira, solo para
      // ver el flujo. No persiste ni autentica nada.
      if (method === 'POST')
        return {
          id: uid(),
          label: 'extensión de Chrome',
          created_at: nowIso(),
          last_used_at: null,
          token: 'trama_pat_demo_no_sirve_fuera_del_modo_prueba',
        }
      if (method === 'DELETE') return { ok: true }
      return []
    case 'chat':
      // /api/chat/threads  |  /api/chat/threads/:id/messages
      return []
    case 'graph':
      return {
        from: null,
        entities: [],
        relationships: [],
        hops: 1,
        limit: 0,
        truncated: false,
      }
    case 'spotify':
      if (id === 'status') return { connected: false }
      if (id === 'plays') return { groups: [], total: 0 }
      if (id === 'timing') return { byHour: [], byWeekday: [] }
      return { connected: false }
    case 'x':
      // Integración con X — inerte en demo (necesita app de X + red real).
      if (id === 'sync') return { fetched: 0, inserted: 0, classified: 0 }
      if (id === 'classify') return { classified: 0, remaining: false }
      if (id === 'cronica') return { cronica: null }
      if (id === 'bookmarks') {
        if (method === 'DELETE') return { ok: true }
        return { items: [] }
      }
      return { connected: false }
    case 'export':
      return {
        entities: live(store.entities),
        relationships: live(store.relationships),
        quotes: live(store.quotes),
        momentos: live(store.momentos),
        momento_comments: live(store.momento_comments),
        momento_reactions: live(store.momento_reactions),
      }
    default:
      // Mutaciones desconocidas → ok; lecturas desconocidas → lista vacía.
      return method === 'GET' ? [] : { ok: true }
  }
}

let benchCache: { n: number; entities: Row[]; relationships: Row[] } | null = null

function graphBenchData(): { entities: Row[]; relationships: Row[] } | null {
  let n = 0
  try {
    n = Number(window.localStorage.getItem('trama-demo-graph-bench') ?? 0)
  } catch {
    return null
  }
  if (!Number.isFinite(n) || n < 10) return null
  if (benchCache?.n === n) return benchCache
  const TYPES = ['escritor', 'libro', 'concepto', 'musico', 'cancion', 'persona']
  const now = new Date().toISOString()
  // PRNG determinístico (mulberry32): el banco es reproducible.
  let seed = 0x9e3779b9 ^ n
  const rand = () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const entities: Row[] = Array.from({ length: n }, (_, i) => ({
    id: `bench-${i}`,
    type: TYPES[i % TYPES.length]!,
    name: `Nodo ${i + 1}`,
    origin: { kind: 'manual' },
    created_at: now,
    updated_at: now,
  }))
  const relationships: Row[] = []
  const m = Math.floor(n * 2.5)
  for (let i = 0; i < m; i += 1) {
    // Preferencia por hubs: cola larga realista (potencia de rand sesga
    // hacia índices bajos — los primeros nodos acumulan grado).
    const a = Math.floor(Math.pow(rand(), 2.2) * n)
    const b = Math.floor(rand() * n)
    if (a === b) continue
    relationships.push({
      id: `bench-r-${i}`,
      from_id: `bench-${a}`,
      to_id: `bench-${b}`,
      type: 'asociado_con',
      origin: { kind: 'manual' },
      created_at: now,
      updated_at: now,
    })
  }
  benchCache = { n, entities, relationships }
  return benchCache
}
