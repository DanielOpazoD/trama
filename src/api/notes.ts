/**
 * Trama Notas — cliente de apuntes rápidos. Transforma snake→camel en la
 * frontera (como el resto de src/api). Las etiquetas las deriva el server.
 */
import { request } from './request'

export type Note = {
  id: string
  content: string
  tags: string[]
  pinned: boolean
  /** id del Momento al que se promovió esta nota (Fase 4), o null. */
  promotedMomentoId: string | null
  createdAt: string
  updatedAt: string
  /** ¿Tiene imágenes adjuntas? Derivado server-side (EXISTS) para evitar una
   *  consulta de anexos por nota al pintar la lista. */
  hasImages: boolean
}

type NoteRow = {
  id: string
  content: string
  tags: string[] | null
  pinned: boolean
  promoted_momento_id: string | null
  created_at: string
  updated_at: string
  has_images?: boolean | null
}

function noteFromRow(r: NoteRow): Note {
  return {
    id: r.id,
    content: r.content,
    tags: r.tags ?? [],
    pinned: r.pinned,
    promotedMomentoId: r.promoted_momento_id,
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
  async create(content: string, pinned = false): Promise<Note> {
    const row = await request<NoteRow>('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ content, pinned }),
    })
    return noteFromRow(row)
  },
  async update(id: string, patch: { content?: string; pinned?: boolean }): Promise<Note> {
    const row = await request<NoteRow>(`/api/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    return noteFromRow(row)
  },
  async remove(id: string): Promise<void> {
    await request(`/api/notes/${id}`, { method: 'DELETE' })
  },
  /** Fase 4: promueve la nota a un Momento (kind=nota). Devuelve su id. */
  async promote(id: string): Promise<{ momentoId: string }> {
    return request(`/api/notes/${id}/promote`, { method: 'POST' })
  },
}
