/**
 * Cronología (Bloque #4) — la superficie de lectura del tiempo.
 *
 * Un stream plano newest-first que teje las cuatro corrientes del archivo:
 *   - citas     (lo que el lenguaje fijó, con su entidad)
 *   - momentos  (lo que se capturó del día)
 *   - escuchas  (un digest SEMANAL: el artista que más sonó esa semana)
 *   - crónicas  (la voz de la IA sobre el mes — el ensayo mensual)
 *
 * El servidor hace el merge k-vías y devuelve un cursor (`nextCursor`) para
 * paginar hacia atrás en el tiempo. Las claves ya vienen en camelCase, así
 * que no hace falta transform. Ver `netlify/functions/cronologia.mts`.
 */

import { request } from './request'

export type CronologiaCita = {
  kind: 'cita'
  id: string
  occurredAt: string
  text: string
  source: string | null
  entityId: string
  entityName: string
}

export type CronologiaMomento = {
  kind: 'momento'
  id: string
  occurredAt: string
  momentoKind: string
  text: string
}

export type CronologiaCronica = {
  kind: 'cronica'
  id: string
  occurredAt: string
  year: number
  month: number
  text: string
}

export type CronologiaEscucha = {
  kind: 'escucha'
  id: string
  occurredAt: string
  weekStart: string
  topArtist: string | null
  topArtistPlays: number
  totalPlays: number
}

export type CronologiaEntrada =
  | CronologiaCita
  | CronologiaMomento
  | CronologiaCronica
  | CronologiaEscucha

export type CronologiaResponse = {
  entradas: CronologiaEntrada[]
  nextCursor: string | null
}

export const cronologiaApi = {
  /**
   * Hojea el tiempo hacia atrás. `before` es el cursor (ISO): solo trae
   * entradas con occurred_at < before. `limit` default 40, max 100.
   */
  async cronologia(opts?: {
    before?: string | null
    limit?: number
  }): Promise<CronologiaResponse> {
    const params = new URLSearchParams()
    if (opts?.before) params.set('before', opts.before)
    if (opts?.limit) params.set('limit', String(opts.limit))
    const q = params.toString()
    return request<CronologiaResponse>(`/api/cronologia${q ? `?${q}` : ''}`)
  },
}
