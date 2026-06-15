/**
 * Feed unificado de Notas — cliente del endpoint `/api/notas-feed`.
 *
 * El feed (notas + recortes mezclados, ordenados por fecha) se calcula y pagina
 * SERVER-SIDE (read-model `objects` + keyset). Este módulo transforma la
 * respuesta snake→camel reusando los transforms de dominio (`noteFromRow` /
 * `recorteFromRow`) — la frontera de camelCase, como el resto de src/api.
 *
 * `CaptureItem` es la forma canónica que la vista consume (unión discriminada
 * por `type`): la UI nunca inspecciona campos crudos para adivinar de qué es
 * cada tarjeta — pregunta por `item.type` y obtiene la entidad ya tipada. El
 * seam `useNotasFeed` re-exporta este tipo.
 */
import { request } from './request'
import { noteFromRow, type Note, type NoteRow } from './notes'
import { recorteFromRow, type Recorte, type RecorteRow } from './recortes'

export type CaptureItem =
  | { type: 'note'; id: string; createdAt: string; note: Note }
  | { type: 'recorte'; id: string; createdAt: string; recorte: Recorte }

/** Segmento del control segmentado servible por el endpoint. */
export type NotasFeedServerSegment = 'todo' | 'escritas' | 'capturas'

/** Triage de recortes (espejo de RecorteStatusFilter, sin null). */
export type NotasFeedServerStatus = 'all' | 'pending' | 'promoted' | 'archived'

export type FetchNotasFeedParams = {
  segment: NotasFeedServerSegment
  status?: NotasFeedServerStatus
  tag?: string
  day?: string | null
  q?: string
  cursor?: string | null
  limit?: number
}

export type NotasFeedPage = {
  items: CaptureItem[]
  nextCursor: string | null
}

/** Forma cruda de la respuesta del servidor (snake_case en las filas). */
type ServerItem =
  | { type: 'note'; id: string; createdAt: string; note: NoteRow }
  | { type: 'recorte'; id: string; createdAt: string; recorte: RecorteRow }

type ServerResponse = { items: ServerItem[]; nextCursor: string | null }

export const notasFeedApi = {
  async fetchNotasFeed(params: FetchNotasFeedParams): Promise<NotasFeedPage> {
    const qs = new URLSearchParams()
    qs.set('segment', params.segment)
    if (params.status) qs.set('status', params.status)
    if (params.tag) qs.set('tag', params.tag)
    if (params.day) qs.set('day', params.day)
    if (params.q) qs.set('q', params.q)
    if (params.cursor) qs.set('cursor', params.cursor)
    if (params.limit) qs.set('limit', String(params.limit))

    const res = await request<ServerResponse>(`/api/notas-feed?${qs.toString()}`)
    const items: CaptureItem[] = res.items.map((it) =>
      it.type === 'note'
        ? { type: 'note', id: it.id, createdAt: it.createdAt, note: noteFromRow(it.note) }
        : {
            type: 'recorte',
            id: it.id,
            createdAt: it.createdAt,
            recorte: recorteFromRow(it.recorte),
          },
    )
    return { items, nextCursor: res.nextCursor }
  },
}
