import { request } from './request'
import type { World } from '../types/world'

/**
 * Preferencias de UI por usuario (sincronizadas entre dispositivos). Objeto
 * extensible; el PUT hace merge superficial server-side, así cada `save` manda
 * solo la(s) clave(s) que cambian (con su sub-objeto completo).
 */
export type UserPrefs = {
  /** Por sección del mundo Notas: false = oculta. Ausente = visible. */
  visibleModules?: Record<string, boolean>
  /** Mundo que abre por defecto en almacenamiento fresco. */
  defaultWorld?: World
}

export const userPrefsApi = {
  async get(): Promise<UserPrefs> {
    return request<UserPrefs>('/api/user-prefs')
  },
  async save(patch: UserPrefs): Promise<UserPrefs> {
    return request<UserPrefs>('/api/user-prefs', {
      method: 'PUT',
      body: JSON.stringify(patch),
    })
  },
}
