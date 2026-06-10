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
  /** Por sección del mundo Trama (ViewMode): false = oculta. Ausente = visible. */
  visibleSections?: Record<string, boolean>
  /** Por sección (ambos mundos): true = pide PIN al navegar. */
  pinnedSections?: Record<string, boolean>
  /** Alias/comandos personalizados por sección (ambos mundos). */
  sectionAliases?: Record<string, string>
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
