/**
 * Modo prueba (demo) — un backend liviano en el navegador.
 *
 * Cuando está activo, `request()` (src/api/request.ts) NO pega a `/api/*`:
 * delega acá, que sirve desde un store en `localStorage` sembrado con datos
 * de ejemplo. Permite recorrer y EDITAR la app (entidades, relaciones, citas,
 * momentos, notas, tareas) sin cuenta ni base de datos — todo queda en este
 * navegador, con el banner "modo prueba". Las funciones de IA quedan
 * desactivadas (no gastan API).
 *
 * Las formas que devuelve son las del SERVIDOR (snake_case): los transforms de
 * `src/api/` corren después, igual que con el backend real.
 */

const FLAG_KEY = 'trama-demo'
const STORE_KEY = 'trama-demo-store'

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(FLAG_KEY) === '1'
}
export function enterDemoMode(): void {
  window.localStorage.setItem(FLAG_KEY, '1')
}
export function exitDemoMode(): void {
  window.localStorage.removeItem(FLAG_KEY)
  window.localStorage.removeItem(STORE_KEY)
}

const DEMO_PHOTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" role="img" aria-label="Cuaderno abierto">
  <defs>
    <linearGradient id="paper" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#f8f3e7"/>
      <stop offset="1" stop-color="#ded3bd"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="#2f3c35"/>
  <rect x="170" y="105" width="860" height="590" rx="22" fill="url(#paper)"/>
  <path d="M600 120v555" stroke="#b8aa8e" stroke-width="5"/>
  <g stroke="#81745e" stroke-width="5" stroke-linecap="round" opacity=".72">
    <path d="M250 210h260M250 275h210M250 340h245M250 405h185"/>
    <path d="M690 220h260M690 285h210M690 350h245M690 415h170"/>
  </g>
  <circle cx="905" cy="550" r="58" fill="#b9824b" opacity=".82"/>
</svg>`

function silentWav(durationSeconds = 1): Uint8Array {
  const sampleRate = 8000
  const samples = sampleRate * durationSeconds
  const bytes = new Uint8Array(44 + samples * 2)
  const view = new DataView(bytes.buffer)
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i)
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples * 2, true)
  return bytes
}

export function demoMediaResponse(url: string): Response | null {
  const path = url.split('?')[0] ?? url
  if (path === '/api/momentos-file/demo/cuaderno.svg') {
    return new Response(DEMO_PHOTO_SVG, {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }
  if (path === '/api/momentos-file/demo/nota-voz.wav') {
    return new Response(silentWav().buffer as ArrayBuffer, {
      headers: { 'Content-Type': 'audio/wav' },
    })
  }
  // Anexos de Notas/Tareas en modo prueba: cualquier key sirve el placeholder
  // (no hay blobs reales), así la tira de fotos se ve en vez de quedar rota.
  if (path.startsWith('/api/notas-attachments-file/')) {
    return new Response(DEMO_PHOTO_SVG, {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }
  return null
}

// ---------- Store ----------

type Row = {
  id: string
  created_at: string
  updated_at: string
  deleted_at?: string | null
  [k: string]: unknown
}
type Store = {
  entities: Row[]
  relationships: Row[]
  quotes: Row[]
  momentos: Row[]
  notes: Row[]
  tasks: Row[]
  prompts: Row[]
  secrets: Row[]
  notas_attachments: Row[]
  month_notes: Row[]
}

function uid(): string {
  return crypto.randomUUID()
}
function nowIso(): string {
  return new Date().toISOString()
}
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}
function dateAgo(n: number): string {
  return daysAgo(n).slice(0, 10)
}
/** Lunes (local) de la semana de hace `n` días, como 'YYYY-MM-DD'. */
function weekStartAgo(n: number): string {
  const base = new Date(Date.now() - n * 86_400_000)
  const local = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  const dow = (local.getDay() + 6) % 7 // 0 = lunes
  local.setDate(local.getDate() - dow)
  const mm = String(local.getMonth() + 1).padStart(2, '0')
  const dd = String(local.getDate()).padStart(2, '0')
  return `${local.getFullYear()}-${mm}-${dd}`
}

/** Deriva #etiquetas (igual criterio que el servidor). */
function parseTags(text: string): string[] {
  const out = new Set<string>()
  const re = /(?:^|\s)#([\p{L}\p{N}_-]{1,40})/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.add(m[1]!.toLowerCase())
  return [...out]
}

function extractPromptVariables(text: string): string[] {
  const out = new Set<string>()
  const re = /\{\{\s*([A-Za-z_][A-Za-z0-9_]{0,39})\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.add(m[1]!)
  return [...out]
}

function buildSeed(): Store {
  const ts = (d: number) => ({ created_at: daysAgo(d), updated_at: daysAgo(d) })
  type DemoOrigin = { kind: string; provider?: string }
  const manual: DemoOrigin = { kind: 'manual' }
  const ai: DemoOrigin = { kind: 'ai', provider: 'deepseek' }

  const eBorges = {
    id: 'e-borges',
    type: 'escritor',
    name: 'Jorge Luis Borges',
    year: 1899,
    description: 'El bibliotecario ciego del infinito.',
    essay: null,
    position_x: -120,
    position_y: -40,
    spotify_url: null,
    origin: manual,
    ...ts(20),
  }
  const eCortazar = {
    id: 'e-cortazar',
    type: 'escritor',
    name: 'Julio Cortázar',
    year: 1914,
    description: 'Cronopio mayor; la rayuela como método.',
    essay: null,
    position_x: 90,
    position_y: -70,
    spotify_url: null,
    origin: manual,
    ...ts(16),
  }
  const eFicciones = {
    id: 'e-ficciones',
    type: 'libro',
    name: 'Ficciones',
    year: 1944,
    description: null,
    essay: null,
    position_x: -180,
    position_y: 60,
    spotify_url: null,
    origin: manual,
    ...ts(14),
  }
  const eRayuela = {
    id: 'e-rayuela',
    type: 'libro',
    name: 'Rayuela',
    year: 1963,
    description: null,
    essay: null,
    position_x: 160,
    position_y: 40,
    spotify_url: null,
    origin: ai,
    ...ts(12),
  }
  const eLaberinto = {
    id: 'e-laberinto',
    type: 'concepto',
    name: 'El laberinto',
    year: null,
    description: 'Lo que se recorre sin centro.',
    essay: null,
    position_x: 0,
    position_y: 120,
    spotify_url: null,
    origin: manual,
    ...ts(9),
  }
  const eRadiohead = {
    id: 'e-radiohead',
    type: 'banda',
    name: 'Radiohead',
    year: 1985,
    description: null,
    essay: null,
    position_x: 40,
    position_y: -150,
    spotify_url: null,
    origin: manual,
    ...ts(6),
  }

  const entities: Row[] = [
    eBorges,
    eCortazar,
    eFicciones,
    eRayuela,
    eLaberinto,
    eRadiohead,
  ]

  const rel = (
    from: string,
    to: string,
    type: string,
    d: number,
    origin = manual,
  ): Row => ({
    id: uid(),
    from_id: from,
    to_id: to,
    type,
    notes: null,
    origin,
    ...ts(d),
  })
  const relationships: Row[] = [
    rel('e-borges', 'e-ficciones', 'escribio', 14),
    rel('e-cortazar', 'e-rayuela', 'escribio', 12),
    rel('e-borges', 'e-cortazar', 'influyo', 11, ai),
    rel('e-ficciones', 'e-laberinto', 'menciona', 9),
    rel('e-rayuela', 'e-laberinto', 'menciona', 8),
  ]

  const quote = (
    entity: string,
    text: string,
    source: string,
    d: number,
    extra: Partial<Row> = {},
  ): Row => ({
    id: uid(),
    entity_id: entity,
    text,
    source,
    context: null,
    link: null,
    user_reflection: null,
    linked_quote_ids: [],
    pinned_at: null,
    resonance: null,
    origin: manual,
    ...ts(d),
    ...extra,
  })
  const quotes: Row[] = [
    quote(
      'e-borges',
      'Siempre imaginé que el Paraíso sería algún tipo de biblioteca.',
      'El libro de arena',
      18,
      { pinned_at: daysAgo(2), resonance: 5 },
    ),
    quote(
      'e-borges',
      'Uno no es lo que es por lo que escribe, sino por lo que ha leído.',
      'Entrevistas',
      13,
      { resonance: 4 },
    ),
    quote(
      'e-cortazar',
      'Andábamos sin buscarnos pero sabiendo que andábamos para encontrarnos.',
      'Rayuela',
      10,
      { resonance: 4, user_reflection: 'La amistad como deriva.' },
    ),
    quote(
      'e-cortazar',
      'Nada está perdido si se tiene el valor de proclamar que todo está perdido.',
      'Rayuela',
      7,
    ),
  ]

  const momentos: Row[] = [
    {
      id: uid(),
      kind: 'nota',
      captured_at: daysAgo(5),
      payload: {
        bodyText:
          'Releer Ficciones con calma este invierno. El jardín de senderos que se bifurcan sigue abriendo puertas.',
      },
      note: null,
      origin: manual,
      entity_ids: ['e-borges', 'e-ficciones'],
      ...ts(5),
    },
    {
      id: uid(),
      kind: 'recorte',
      captured_at: daysAgo(3),
      payload: {
        title: 'Sobre la relectura',
        url: 'https://example.com/relectura',
        bodyText: 'Un texto nunca se lee dos veces igual.',
      },
      note: 'guardar para el ensayo',
      origin: manual,
      entity_ids: ['e-laberinto'],
      ...ts(3),
    },
    {
      id: uid(),
      kind: 'foto',
      captured_at: daysAgo(1),
      payload: {
        caption: 'Cuaderno abierto',
        items: [{ storageKey: 'demo/cuaderno.svg', width: 1200, height: 800 }],
        storageKey: 'demo/cuaderno.svg',
        width: 1200,
        height: 800,
        audioKey: 'demo/nota-voz.wav',
      },
      note: 'Una nota de voz breve para probar el reproductor.',
      origin: manual,
      entity_ids: ['e-borges'],
      ...ts(1),
    },
  ]

  const note = (content: string, d: number, pinned = false): Row => ({
    id: uid(),
    content,
    tags: parseTags(content),
    pinned,
    promoted_momento_id: null,
    origin: manual,
    ...ts(d),
  })
  const notes: Row[] = [
    note('Idea para el ensayo sobre #memoria y olvido en Borges.', 1, true),
    note('Releer el final de #Rayuela — el tablero y los puentes.', 2),
    note('Comprar la edición anotada de #Ficciones.', 4),
    note('Cita pendiente de verificar sobre el #laberinto.', 7),
  ]

  const task = (title: string, d: number, extra: Partial<Row> = {}): Row => ({
    id: uid(),
    title,
    detail: null,
    done: false,
    due_date: null,
    priority: 'media',
    week_start: weekStartAgo(d),
    category: 'trabajo',
    completed_at: null,
    tags: parseTags(title),
    origin: manual,
    ...ts(d),
    ...extra,
  })
  const thisWeek = weekStartAgo(0)
  const lastWeek = weekStartAgo(7)
  const tasks: Row[] = [
    task('Terminar el ensayo sobre #memoria', 1, {
      detail: 'Revisar las citas marcadas como resonantes.',
      priority: 'alta',
      week_start: thisWeek,
    }),
    task('Responder el correo de la editorial', 1, {
      priority: 'alta',
      due_date: dateAgo(-2),
      week_start: thisWeek,
    }),
    task('Ordenar las #notas de la semana', 2, {
      priority: 'media',
      week_start: thisWeek,
    }),
    task('Comprar tinta para la #pluma', 2, {
      priority: 'baja',
      week_start: thisWeek,
      category: 'personal',
    }),
    task('Llamar a la biblioteca por el préstamo', 8, {
      priority: 'media',
      week_start: lastWeek,
      category: 'personal',
    }),
    task('Leer un capítulo de Rayuela', 8, {
      done: true,
      completed_at: daysAgo(6),
      week_start: lastWeek,
    }),
  ]

  return {
    entities,
    relationships,
    quotes,
    momentos,
    notes,
    tasks,
    prompts: [],
    secrets: [],
    notas_attachments: [],
    month_notes: [],
  }
}

function load(): Store {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Store>
      return {
        entities: parsed.entities ?? [],
        relationships: parsed.relationships ?? [],
        quotes: parsed.quotes ?? [],
        momentos: parsed.momentos ?? [],
        notes: parsed.notes ?? [],
        tasks: parsed.tasks ?? [],
        prompts: parsed.prompts ?? [],
        secrets: parsed.secrets ?? [],
        notas_attachments: parsed.notas_attachments ?? [],
        month_notes: parsed.month_notes ?? [],
      }
    }
  } catch {
    /* corrupto → re-sembramos */
  }
  const seed = buildSeed()
  save(seed)
  return seed
}
function save(store: Store): void {
  window.localStorage.setItem(STORE_KEY, JSON.stringify(store))
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
function route(
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

  if (resource === 'month-notes') {
    if (method === 'GET') {
      const month = params.get('month') ?? ''
      const row = store.month_notes.find((r) => r.month_key === month && !r.deleted_at)
      return { monthKey: month, content: (row?.content as string) ?? '' }
    }
    if (method === 'PUT') {
      const month = String(body.month ?? '')
      const content = String(body.content ?? '')
      const row = store.month_notes.find((r) => r.month_key === month && !r.deleted_at)
      if (row) {
        row.content = content
        row.updated_at = nowIso()
      } else {
        store.month_notes.push({
          id: uid(),
          user_id: 'legacy-single-user',
          month_key: month,
          content,
          created_at: nowIso(),
          updated_at: nowIso(),
          deleted_at: null,
        })
      }
      save(store)
      return { monthKey: month, content }
    }
  }

  // ---- recursos manuales con CRUD ----
  const collections: Record<string, Row[] | undefined> = {
    entities: store.entities,
    relationships: store.relationships,
    quotes: store.quotes,
    momentos: store.momentos,
    notes: store.notes,
    tasks: store.tasks,
    prompts: store.prompts,
    secrets: store.secrets,
    'notas-attachments': store.notas_attachments,
  }
  const rows = collections[resource]

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
      const r = store[resource as keyof Store].find((x) => x.id === id)
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
      // notes/tasks devuelven {ok:true}; el resto {deletedAt}.
      return resource === 'notes' ||
        resource === 'tasks' ||
        resource === 'prompts' ||
        resource === 'secrets' ||
        resource === 'notas-attachments'
        ? { ok: true }
        : { deletedAt: nowIso() }
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
      }
    default:
      // Mutaciones desconocidas → ok; lecturas desconocidas → lista vacía.
      return method === 'GET' ? [] : { ok: true }
  }
}

export async function demoRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  let body: Record<string, unknown> = {}
  if (init?.body && typeof init.body === 'string') {
    body = JSON.parse(init.body) as Record<string, unknown>
  } else if (typeof FormData !== 'undefined' && init?.body instanceof FormData) {
    body = Object.fromEntries(init.body.entries())
  }
  const [rawPath, qs] = url.split('?')
  const params = new URLSearchParams(qs ?? '')
  const store = load()
  // Pequeña latencia para que las transiciones/skeletons se sientan reales.
  await new Promise((r) => setTimeout(r, 80))
  return route(method, rawPath ?? url, params, body, store) as T
}
