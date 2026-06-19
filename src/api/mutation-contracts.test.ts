import { describe, expect, it } from 'vitest'
import { requireDeletedAt } from './mutation-contracts'

describe('API mutation contracts', () => {
  it('acepta deletedAt no vacío para flujos con undo', () => {
    expect(requireDeletedAt('2026-06-18T11:00:00.000Z', 'DELETE /api/notes/:id')).toBe(
      '2026-06-18T11:00:00.000Z',
    )
  })

  it.each([null, undefined, '', '   '])(
    'rechaza deletedAt ausente o vacío: %s',
    (value) => {
      expect(() => requireDeletedAt(value, 'DELETE /api/notes/:id')).toThrow(
        'DELETE /api/notes/:id did not return deletedAt',
      )
    },
  )
})
