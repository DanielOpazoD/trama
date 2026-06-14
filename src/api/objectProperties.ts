/**
 * Escritura de propiedades de usuario + tags sobre un objeto (Fase 2 del motor
 * de queries). `PATCH /api/object-properties`. Las propiedades quedan luego
 * consultables vía `prop:<key>` en el motor de queries.
 */

import { request } from './request'
import type { ObjectKind } from './query'

export type ObjectPropertiesInput = {
  kind: ObjectKind
  id: string
  /** Claves a setear/sobrescribir (merge). */
  setProps?: Record<string, string | number | boolean>
  /** Claves a borrar. */
  unsetProps?: string[]
  /** Reemplaza la lista de tags completa. */
  setTags?: string[]
}

export const objectPropertiesApi = {
  update(input: ObjectPropertiesInput): Promise<{ id: string }> {
    return request<{ id: string }>('/api/object-properties', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
}
