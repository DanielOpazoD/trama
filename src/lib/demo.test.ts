import { describe, it, expect, beforeEach } from 'vitest'
import { isDemoMode, enterDemoMode, exitDemoMode, demoRequest } from './demo'

/**
 * Modo prueba (demo.ts) — backend local en localStorage.
 *
 * Es el ÚNICO camino funcional sin backend, así que un cambio de schema o de
 * transform lo puede romper en silencio. Estos tests cubren el flag, el seed,
 * el CRUD soft-delete, las sub-acciones (promote/restore), y que la IA quede
 * desactivada. Las formas son las del servidor (snake_case).
 */

beforeEach(() => {
  window.localStorage.clear()
})

describe('demo — flag de modo prueba', () => {
  it('isDemoMode refleja enter/exit', () => {
    expect(isDemoMode()).toBe(false)
    enterDemoMode()
    expect(isDemoMode()).toBe(true)
    exitDemoMode()
    expect(isDemoMode()).toBe(false)
  })

  it('exitDemoMode borra el store sembrado', async () => {
    enterDemoMode()
    await demoRequest('/api/entities') // siembra el store
    expect(window.localStorage.getItem('trama-demo-store')).not.toBeNull()
    exitDemoMode()
    expect(window.localStorage.getItem('trama-demo-store')).toBeNull()
  })
})

describe('demo — seed + lecturas', () => {
  it('GET /api/entities devuelve las entidades sembradas (shape de servidor)', async () => {
    const list = await demoRequest<Array<Record<string, unknown>>>('/api/entities')
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBe(6)
    const borges = list.find((e) => e.id === 'e-borges')
    expect(borges).toMatchObject({ name: 'Jorge Luis Borges', type: 'escritor' })
    // snake_case del servidor, no camelCase.
    expect(borges).toHaveProperty('created_at')
    expect(borges).toHaveProperty('spotify_url')
  })

  it('GET con ?limit devuelve la forma paginada {items, nextCursor}', async () => {
    const page = await demoRequest<{ items: unknown[]; nextCursor: null }>(
      '/api/momentos?limit=50',
    )
    expect(page).toHaveProperty('items')
    expect(page.nextCursor).toBeNull()
    expect(Array.isArray(page.items)).toBe(true)
  })

  it('siembra un momento foto con media local para probar timeline y album', async () => {
    const page = await demoRequest<{ items: Array<Record<string, unknown>> }>(
      '/api/momentos?limit=50',
    )
    const foto = page.items.find((item) => item.kind === 'foto')

    expect(foto).toMatchObject({
      kind: 'foto',
      payload: {
        caption: 'Cuaderno abierto',
        storageKey: 'demo/cuaderno.svg',
        audioKey: 'demo/nota-voz.wav',
      },
    })
  })

  it('GET /api/health devuelve counts coherentes con el seed', async () => {
    const health = await demoRequest<{ counts: Record<string, number> }>('/api/health')
    expect(health.counts.entities).toBe(6)
    expect(health.counts.quotes).toBeGreaterThan(0)
  })

  it('GET /api/notas-feed mezcla notas y capturas (con una captura de imagen)', async () => {
    type Item =
      | { type: 'note'; note: Record<string, unknown> }
      | { type: 'recorte'; recorte: Record<string, unknown> }
    const todo = await demoRequest<{ items: Item[]; nextCursor: null }>(
      '/api/notas-feed?segment=todo&limit=50',
    )
    expect(todo.nextCursor).toBeNull()
    expect(todo.items.some((it) => it.type === 'note')).toBe(true)
    expect(todo.items.some((it) => it.type === 'recorte')).toBe(true)

    // El segmento Capturas trae solo recortes, incluida la captura de imagen.
    const capturas = await demoRequest<{ items: Item[] }>(
      '/api/notas-feed?segment=capturas&status=pending&limit=50',
    )
    expect(capturas.items.every((it) => it.type === 'recorte')).toBe(true)
    const conImagen = capturas.items.find(
      (it): it is Extract<Item, { type: 'recorte' }> =>
        it.type === 'recorte' && it.recorte.capture_mode === 'image',
    )
    expect(conImagen?.recorte.image_key).toBeTruthy()
  })
})

describe('demo — CRUD con soft-delete', () => {
  it('POST /api/notes deriva #etiquetas del contenido', async () => {
    const note = await demoRequest<Record<string, unknown>>('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ content: 'apunte sobre #memoria y #olvido' }),
    })
    expect(note.id).toBeTruthy()
    expect(note.tags).toEqual(expect.arrayContaining(['memoria', 'olvido']))
    expect(note.promoted_momento_id).toBeNull()
    expect(note).toHaveProperty('created_at')
  })

  it('POST /api/tasks arranca con done:false y tags del título', async () => {
    const task = await demoRequest<Record<string, unknown>>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'revisar #citas' }),
    })
    expect(task.done).toBe(false)
    expect(task.completed_at).toBeNull()
    expect(task.tags).toEqual(['citas'])
  })

  it('PATCH /api/tasks/:id done:true setea completed_at', async () => {
    const task = await demoRequest<{ id: string }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'tarea' }),
    })
    const patched = await demoRequest<Record<string, unknown>>(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ done: true }),
    })
    expect(patched.done).toBe(true)
    expect(patched.completed_at).not.toBeNull()
  })

  it('DELETE /api/notes/:id devuelve {ok} y la oculta de la lista', async () => {
    const note = await demoRequest<{ id: string }>('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ content: 'a borrar' }),
    })
    const del = await demoRequest<{ ok: boolean }>(`/api/notes/${note.id}`, {
      method: 'DELETE',
    })
    expect(del.ok).toBe(true)
    const list = await demoRequest<Array<{ id: string }>>('/api/notes')
    expect(list.find((n) => n.id === note.id)).toBeUndefined()
  })

  it('DELETE /api/entities/:id devuelve {deletedAt} (no {ok})', async () => {
    const del = await demoRequest<{ deletedAt: string }>('/api/entities/e-radiohead', {
      method: 'DELETE',
    })
    expect(del.deletedAt).toBeTruthy()
    const list = await demoRequest<Array<{ id: string }>>('/api/entities')
    expect(list.find((e) => e.id === 'e-radiohead')).toBeUndefined()
  })

  it('POST /api/:resource/:id/restore revive un soft-delete', async () => {
    await demoRequest('/api/entities/e-radiohead', { method: 'DELETE' })
    const restored = await demoRequest<{ restored: boolean }>(
      '/api/entities/e-radiohead/restore',
      { method: 'POST' },
    )
    expect(restored.restored).toBe(true)
    const list = await demoRequest<Array<{ id: string }>>('/api/entities')
    expect(list.find((e) => e.id === 'e-radiohead')).toBeDefined()
  })

  it('el store persiste entre requests', async () => {
    const created = await demoRequest<{ id: string }>('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ content: 'persistente' }),
    })
    const list = await demoRequest<Array<{ id: string }>>('/api/notes')
    expect(list.find((n) => n.id === created.id)).toBeDefined()
  })

  it('pdf-stamp-assets crea, lista y soft-deletea firmas visuales', async () => {
    const created = await demoRequest<Record<string, unknown>>('/api/pdf-stamp-assets', {
      method: 'POST',
      body: JSON.stringify({
        id: 'signature-demo',
        kind: 'signature',
        name: 'Firma demo',
        src: 'data:image/png;base64,a',
        mimeType: 'image/png',
        width: 320,
        height: 120,
      }),
    })

    expect(created).toMatchObject({
      id: 'signature-demo',
      user_id: 'legacy-single-user',
      mime_type: 'image/png',
    })
    expect(created).toHaveProperty('last_used_at')

    const list = await demoRequest<Array<{ id: string }>>('/api/pdf-stamp-assets')
    expect(list.map((item) => item.id)).toContain('signature-demo')

    const del = await demoRequest<{ ok: boolean }>(
      '/api/pdf-stamp-assets/signature-demo',
      { method: 'DELETE' },
    )
    expect(del.ok).toBe(true)

    const afterDelete = await demoRequest<Array<{ id: string }>>('/api/pdf-stamp-assets')
    expect(afterDelete.find((item) => item.id === 'signature-demo')).toBeUndefined()
  })
})

describe('demo — promover nota a Momento', () => {
  it('POST /api/notes/:id/promote crea un Momento y marca la nota', async () => {
    const note = await demoRequest<{ id: string }>('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ content: 'idea a promover' }),
    })
    const before = await demoRequest<unknown[]>('/api/momentos')
    const res = await demoRequest<{ momentoId: string }>(
      `/api/notes/${note.id}/promote`,
      { method: 'POST' },
    )
    expect(res.momentoId).toBeTruthy()
    const after = await demoRequest<unknown[]>('/api/momentos')
    expect(after.length).toBe(before.length + 1)
  })
})

describe('demo — IA desactivada', () => {
  it('quotes reflect lanza el error de IA-off', async () => {
    await expect(
      demoRequest('/api/quotes/q1/reflect', { method: 'POST' }),
    ).rejects.toThrow(/desactivada en el modo prueba/i)
  })

  it('extract lanza el error de IA-off', async () => {
    await expect(
      demoRequest('/api/extract', {
        method: 'POST',
        body: JSON.stringify({ text: 'x' }),
      }),
    ).rejects.toThrow(/desactivada en el modo prueba/i)
  })

  it('search devuelve la forma canónica vacía', async () => {
    const out = await demoRequest<{ mode: string; entities: unknown[] }>(
      '/api/search?q=borges',
    )
    expect(out.mode).toBe('lexical')
    expect(out.entities).toEqual([])
  })
})
