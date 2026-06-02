import { describe, it, expect } from 'vitest'
import { attachmentOwnerExists } from './notas-attachment-owners'

// Para ownerType 'week' el dueño es la fecha del lunes ('YYYY-MM-DD'): no hay
// fila que consultar, así que no toca SQL (pasamos un cliente nulo a propósito).
const noSql = null as never

describe('attachmentOwnerExists — week', () => {
  it('acepta una fecha de semana bien formada', async () => {
    expect(await attachmentOwnerExists(noSql, 'week', '2026-06-01', 'u1')).toBe(true)
  })

  it('rechaza un ownerId que no es una fecha YYYY-MM-DD', async () => {
    expect(await attachmentOwnerExists(noSql, 'week', 'junio', 'u1')).toBe(false)
    expect(await attachmentOwnerExists(noSql, 'week', '', 'u1')).toBe(false)
  })
})

describe('attachmentOwnerExists — task', () => {
  it('rechaza un ownerId que no es un uuid antes de tocar la BD', async () => {
    expect(await attachmentOwnerExists(noSql, 'task', 'no-es-uuid', 'u1')).toBe(false)
    expect(await attachmentOwnerExists(noSql, 'task', '', 'u1')).toBe(false)
  })
})
