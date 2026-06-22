import type { Row, Store } from './demoTypes'
import { saveDemoStore as save } from './demoStore'
import {
  routeDemoBiblioteca,
  routeDemoBibliotecaLinks,
  routeDemoBibliotecaMutation,
  routeDemoLibraryUpload,
  routeDemoLibraryUploadComplete,
  routeDemoLibraryUploadPresign,
  type DemoTargetResolver,
  type DemoUploadFile,
} from './demoBiblioteca'
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

/** Espejo de los EXISTS del backend: ¿la nota tiene anexos de imagen / audio? */
function noteAttachmentFlags(
  store: Store,
  noteId: string,
): { has_images: boolean; has_audio: boolean } {
  const own = store.notas_attachments.filter(
    (a) => a.owner_type === 'note' && a.owner_id === noteId && !a.deleted_at,
  )
  const mimeStarts = (prefix: string) =>
    own.some((a) => typeof a.mime_type === 'string' && a.mime_type.startsWith(prefix))
  return { has_images: mimeStarts('image/'), has_audio: mimeStarts('audio/') }
}

function aiOff(): never {
  throw new Error('La IA está desactivada en el modo prueba.')
}

/** Título legible de un momento desde su payload (espejo de la UI). */
function momentoTitle(m: Row): string {
  const payload = (m.payload ?? {}) as Record<string, unknown>
  const candidate =
    (typeof payload.title === 'string' && payload.title) ||
    (typeof payload.caption === 'string' && payload.caption) ||
    (typeof payload.bodyText === 'string' && payload.bodyText) ||
    (typeof m.note === 'string' && m.note) ||
    ''
  const trimmed = candidate.trim()
  if (!trimmed) return 'Momento'
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed
}

/** Título legible de una nota desde su contenido (primera línea acotada). */
function noteTitle(n: Row): string {
  const title = typeof n.title === 'string' ? n.title.trim() : ''
  if (title) return title
  const content = (typeof n.content === 'string' ? n.content : '').trim()
  if (!content) return '(sin título)'
  const firstLine = content.split('\n', 1)[0] ?? content
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine
}

/**
 * Resuelve el título de un destino de conexión (entidad / nota / momento)
 * contra el store de la demo, para que `targetTitle` de los vínculos coincida
 * con lo que ve el picker. Lo inyectamos en `routeDemoBibliotecaLinks`.
 */
function makeTargetResolver(store: Store): DemoTargetResolver {
  // `live(...)` descarta los soft-deleted: un destino borrado resuelve a null
  // (título "(sin título)" en la UI), igual que el `deleted_at IS NULL` de prod.
  return (targetKind, targetId) => {
    if (targetKind === 'entidad') {
      const e = live(store.entities).find((row) => row.id === targetId)
      return typeof e?.name === 'string' ? e.name : null
    }
    if (targetKind === 'nota') {
      const n = live(store.notes).find((row) => row.id === targetId)
      return n ? noteTitle(n) : null
    }
    const m = live(store.momentos).find((row) => row.id === targetId)
    return m ? momentoTitle(m) : null
  }
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

  // Biblioteca — acciones por item (PR4/PR-C): PATCH /api/biblioteca-item/:kind/:id
  // (renombrar / papelera / etiquetas / fijar). `:kind` y `:id` llegan
  // codificados en la URL; los decodificamos.
  if (resource === 'biblioteca-item' && method === 'PATCH' && id && action) {
    return routeDemoBibliotecaMutation(
      decodeURIComponent(id),
      decodeURIComponent(action),
      body,
    )
  }

  // Biblioteca — subida (PR1 de subida): POST /api/library-uploads. Los archivos
  // vienen bajo la clave reservada `__uploadFiles` (multi-archivo; ver demo.ts).
  if (resource === 'library-uploads' && method === 'POST') {
    const files = Array.isArray(body.__uploadFiles)
      ? (body.__uploadFiles as DemoUploadFile[])
      : []
    return routeDemoLibraryUpload(files)
  }

  // Biblioteca — subida DIRECTA a R2 (archivos grandes): presign + complete. En
  // modo prueba no hay R2, y `api.upload` ya enruta TODO por multipart acá; estos
  // dos responden algo coherente solo si se pega a las rutas a mano.
  if (resource === 'library-uploads-presign' && method === 'POST') {
    return routeDemoLibraryUploadPresign(body)
  }
  if (resource === 'library-uploads-complete' && method === 'POST') {
    return routeDemoLibraryUploadComplete(body)
  }

  // Biblioteca — conexiones (PR-C): /api/biblioteca-links/:kind/:id (GET/POST/DELETE).
  // `:kind` y `:id` llegan codificados. El resolutor de títulos lee el store
  // para que `targetTitle` coincida con los candidatos del picker.
  if (resource === 'biblioteca-links' && id && action) {
    return routeDemoBibliotecaLinks(
      method,
      decodeURIComponent(id),
      decodeURIComponent(action),
      params,
      body,
      makeTargetResolver(store),
    )
  }

  // Lookup de entidades (picker de conexiones): /api/entities-lookup?prefix=…
  // El backend real soporta name/prefix/ids; en demo basta filtrar el seed por
  // prefijo (case-insensitive) y devolver las filas de entidad tal cual.
  if (resource === 'entities-lookup' && method === 'GET') {
    const prefix = (params.get('prefix') ?? '').trim().toLowerCase()
    const name = (params.get('name') ?? '').trim().toLowerCase()
    const idsRaw = params.get('ids')
    const all = live(store.entities)
    if (idsRaw) {
      const ids = new Set(idsRaw.split(',').map((s) => decodeURIComponent(s)))
      return all.filter((e) => ids.has(String(e.id)))
    }
    if (name) {
      return all.filter((e) => String(e.name ?? '').toLowerCase() === name)
    }
    if (prefix) {
      return all
        .filter((e) =>
          String(e.name ?? '')
            .toLowerCase()
            .includes(prefix),
        )
        .slice(0, 10)
    }
    return []
  }

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

  // Observabilidad de WhatsApp en modo prueba: métricas sembradas para que el
  // panel se vea (capturas por ruta + tasa de fallas + actividad reciente).
  if (resource === 'whatsapp-metrics' && method === 'GET') {
    const mins = (n: number) => new Date(Date.now() - n * 60000).toISOString()
    return {
      days: 30,
      total: 18,
      ok: 16,
      failed: 2,
      byKind: [
        { kind: 'recorte', count: 7 },
        { kind: 'momento', count: 5 },
        { kind: 'note', count: 3 },
        { kind: 'task', count: 1 },
      ],
      byEvent: [{ event: 'capture', ok: 16, failed: 2 }],
      daily: [],
      recent: [
        { event: 'capture', kind: 'momento', ok: true, detail: null, createdAt: mins(8) },
        {
          event: 'capture',
          kind: 'recorte',
          ok: true,
          detail: null,
          createdAt: mins(45),
        },
        {
          event: 'capture',
          kind: null,
          ok: false,
          detail: 'toolarge',
          createdAt: mins(180),
        },
        { event: 'capture', kind: 'note', ok: true, detail: null, createdAt: mins(320) },
      ],
    }
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

  if (resource === 'pdf-stamp-assets') {
    const rows = store.pdf_stamp_assets
    if (method === 'GET' && !id) return live(rows)

    if (method === 'POST' && !id) {
      const timestamp = nowIso()
      const row: Row = {
        id: String(body.id ?? uid()),
        user_id: 'legacy-single-user',
        kind: body.kind === 'stamp' ? 'stamp' : 'signature',
        name: String(body.name ?? 'Firma'),
        src: String(body.src ?? ''),
        mime_type: body.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png',
        width: Number(body.width ?? 1),
        height: Number(body.height ?? 1),
        byte_size: String(body.src ?? '').length,
        created_at: timestamp,
        updated_at: timestamp,
        last_used_at: timestamp,
        deleted_at: null,
      }
      const existing = rows.findIndex((item) => item.id === row.id)
      if (existing >= 0) rows[existing] = row
      else rows.unshift(row)
      save(store)
      return row
    }

    const existing = id ? findLive(rows, id) : undefined
    if (!existing) return { ok: false }

    if (method === 'PATCH') {
      existing.name = String(body.name ?? existing.name)
      existing.updated_at = nowIso()
      save(store)
      return existing
    }

    if (method === 'POST' && action === 'touch') {
      const timestamp = nowIso()
      existing.last_used_at = timestamp
      existing.updated_at = timestamp
      save(store)
      return existing
    }

    if (method === 'DELETE') {
      const timestamp = nowIso()
      existing.deleted_at = timestamp
      existing.updated_at = timestamp
      save(store)
      return { ok: true }
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
    'reading-tables': store['reading-tables'],
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

    // Notas: enriquecer con has_images/has_audio (espejo de los EXISTS del backend).
    if (resource === 'notes' && method === 'GET' && !id) {
      return live(rows).map((n) => ({
        ...n,
        ...noteAttachmentFlags(store, String(n.id)),
      }))
    }

    // Anexos: el endpoint real filtra por owner; el listOrPage genérico no, así
    // que filtramos acá para que cada nota/tarea vea solo sus anexos.
    if (resource === 'notas-attachments' && method === 'GET' && !id) {
      const ownerType = params.get('ownerType')
      const ownerId = params.get('ownerId')
      const filtered = live(store.notas_attachments).filter(
        (a) => a.owner_type === ownerType && a.owner_id === ownerId,
      )
      return listOrPage(filtered, params)
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
        ...(resource === 'reading-tables'
          ? {
              material_ids: Array.isArray(body.materialIds) ? body.materialIds : [],
              draft_markdown: (body.draftMarkdown as string) ?? null,
              status: (body.status as string) ?? 'borrador',
              materialIds: undefined,
              draftMarkdown: undefined,
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
      if (resource === 'reading-tables') {
        if (body.materialIds !== undefined)
          r.material_ids = Array.isArray(body.materialIds) ? body.materialIds : []
        if (body.draftMarkdown !== undefined)
          r.draft_markdown = body.draftMarkdown ?? null
        delete r.materialIds
        delete r.draftMarkdown
      }
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
    case 'notas-feed': {
      // Feed unificado de Notas (notas + recortes) — el endpoint real lo
      // pagina server-side; acá mezclamos y filtramos el store para que la
      // vista de Notas (y sus capturas) rendericen en modo prueba.
      const segment = params.get('segment') ?? 'todo'
      const status = params.get('status') // all|pending|promoted|archived
      const q = (params.get('q') ?? '').trim().toLowerCase()
      const tag = params.get('tag')
      const dayStart = params.get('dayStart')
      const dayEnd = params.get('dayEnd')
      const limit = Number.parseInt(params.get('limit') ?? '40', 10) || 40

      const inDay = (iso: unknown): boolean => {
        if (!dayStart || !dayEnd || typeof iso !== 'string') return true
        return iso >= dayStart && iso < dayEnd
      }

      const items: Array<
        { type: string; id: string; createdAt: string; sort: string } & Record<
          string,
          unknown
        >
      > = []

      if (segment === 'todo' || segment === 'escritas') {
        for (const n of live(store.notes)) {
          const created = String(n.created_at ?? '')
          if (!inDay(n.created_at)) continue
          if (tag && !(Array.isArray(n.tags) && (n.tags as string[]).includes(tag)))
            continue
          if (
            q &&
            !`${String(n.content ?? '')} ${String(n.title ?? '')}`
              .toLowerCase()
              .includes(q)
          )
            continue
          items.push({
            type: 'note',
            id: String(n.id),
            createdAt: created,
            sort: created,
            note: { ...n, ...noteAttachmentFlags(store, String(n.id)) },
          })
        }
      }

      if (segment === 'todo' || segment === 'capturas') {
        for (const r of live(store.recortes)) {
          const created = String(r.created_at ?? '')
          const st = String(r.status ?? 'pending')
          if (status === 'all') {
            /* incluye todos */
          } else if (status) {
            if (st !== status) continue
          } else if (st === 'archived') {
            continue
          }
          if (!inDay(r.created_at)) continue
          if (
            q &&
            !`${String(r.text ?? '')} ${String(r.source_title ?? '')} ${String(
              r.source_author ?? '',
            )}`
              .toLowerCase()
              .includes(q)
          )
            continue
          items.push({
            type: 'recorte',
            id: String(r.id),
            createdAt: created,
            sort: created,
            recorte: r,
          })
        }
      }

      // Orden por fecha desc; ante empate, notas antes que recortes.
      items.sort((a, b) => {
        if (a.sort !== b.sort) return a.sort < b.sort ? 1 : -1
        if (a.type === b.type) return 0
        return a.type === 'note' ? -1 : 1
      })

      return {
        items: items.slice(0, limit).map(({ sort: _sort, ...rest }) => rest),
        nextCursor: null,
      }
    }
    case 'biblioteca':
      // Read-model unificado de archivos. Self-contained en demoBiblioteca.ts
      // (no toca el store ni el `_lib` del backend). Aplica tab/q/orden +
      // paginación por offset; devuelve filas snake_case como el endpoint.
      return routeDemoBiblioteca(params)
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
        status: 'ok',
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
