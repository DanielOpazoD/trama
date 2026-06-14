/**
 * Trama Notas — cliente de apuntes rápidos. Transforma snake→camel en la
 * frontera (como el resto de src/api). Las etiquetas las deriva el server.
 */
import { request } from './request'

export type Note = {
  id: string
  content: string
  /** Título corto opcional; null si la nota no tiene. */
  title: string | null
  tags: string[]
  pinned: boolean
  /** id del Momento al que se promovió esta nota (Fase 4), o null. */
  promotedMomentoId: string | null
  /** Medio de captura: 'whatsapp' marca el iconito de procedencia. */
  source: string | null
  createdAt: string
  updatedAt: string
  /** ¿Tiene imágenes adjuntas? Derivado server-side (EXISTS) para evitar una
   *  consulta de anexos por nota al pintar la lista. */
  hasImages: boolean
}

type NoteRow = {
  id: string
  content: string
  title?: string | null
  tags: string[] | null
  pinned: boolean
  promoted_momento_id: string | null
  source?: string | null
  created_at: string
  updated_at: string
  has_images?: boolean | null
}

function noteFromRow(r: NoteRow): Note {
  return {
    id: r.id,
    content: r.content,
    title: r.title ?? null,
    tags: r.tags ?? [],
    pinned: r.pinned,
    promotedMomentoId: r.promoted_momento_id,
    source: r.source ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    hasImages: r.has_images ?? false,
  }
}

export const notesApi = {
  /** Lista las notas del usuario. `q` busca en el contenido; `tag` filtra. */
  async list(opts?: { q?: string; tag?: string }): Promise<Note[]> {
    const params = new URLSearchParams()
    if (opts?.q) params.set('q', opts.q)
    if (opts?.tag) params.set('tag', opts.tag)
    const qs = params.toString()
    const rows = await request<NoteRow[]>(`/api/notes${qs ? `?${qs}` : ''}`)
    return rows.map(noteFromRow)
  },
  async create(
    content: string,
    opts: { title?: string | null; pinned?: boolean } = {},
  ): Promise<Note> {
    const row = await request<NoteRow>('/api/notes', {
      method: 'POST',
      body: JSON.stringify({
        content,
        title: opts.title || undefined,
        pinned: opts.pinned ?? false,
      }),
    })
    return noteFromRow(row)
  },
  async update(
    id: string,
    patch: { content?: string; title?: string | null; pinned?: boolean },
  ): Promise<Note> {
    const row = await request<NoteRow>(`/api/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    return noteFromRow(row)
  },
  async remove(id: string): Promise<{ deletedAt: string | null }> {
    const res = await request<{ ok: boolean; deletedAt?: string | null }>(
      `/api/notes/${id}`,
      { method: 'DELETE' },
    )
    return { deletedAt: res.deletedAt ?? null }
  },
  /** Deshacer del remove: revive la fila (y sus anexos) cuyo deleted_at
      coincide exactamente con el que devolvió el DELETE. */
  async restore(id: string, deletedAt: string): Promise<void> {
    await request<{ restored: boolean }>(`/api/notes/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ deletedAt }),
    })
  },
  /** Fase 4: promueve la nota a un Momento (kind=nota). Devuelve su id. */
  async promote(id: string): Promise<{ momentoId: string }> {
    return request(`/api/notes/${id}/promote`, { method: 'POST' })
  },
}
