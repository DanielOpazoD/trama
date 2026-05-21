import { describe, expect, it } from 'vitest'
import { validateReclassify } from './reclassify-validate'

const ENTITIES = [
  { id: 'e1', name: 'Pink Floyd', type: 'persona' },
  { id: 'e2', name: 'Camus', type: 'persona' },
  { id: 'e3', name: 'absurdo', type: 'concepto' },
]
const VALID_TYPES = new Set([
  'persona', 'banda', 'escritor', 'concepto', 'libro',
])

describe('validateReclassify', () => {
  it('keeps valid reclassifications and attaches entity name + oldType', () => {
    const out = validateReclassify(
      {
        reclassifications: [
          { id: 'e1', newType: 'banda', reason: 'es una banda inglesa' },
          { id: 'e2', newType: 'escritor', reason: 'es un escritor' },
        ],
      },
      ENTITIES,
      VALID_TYPES,
    )
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      id: 'e1',
      name: 'Pink Floyd',
      oldType: 'persona',
      newType: 'banda',
      reason: 'es una banda inglesa',
    })
    expect(out[1].newType).toBe('escritor')
  })

  it('drops items pointing to unknown entity ids', () => {
    const out = validateReclassify(
      {
        reclassifications: [
          { id: 'ghost', newType: 'banda' },
          { id: 'e1', newType: 'banda' },
        ],
      },
      ENTITIES,
      VALID_TYPES,
    )
    expect(out.map((r) => r.id)).toEqual(['e1'])
  })

  it('drops items with a type not in the valid set', () => {
    const out = validateReclassify(
      {
        reclassifications: [
          { id: 'e1', newType: 'inventado' },
          { id: 'e2', newType: 'escritor' },
        ],
      },
      ENTITIES,
      VALID_TYPES,
    )
    expect(out.map((r) => r.id)).toEqual(['e2'])
  })

  it('drops no-op reclassifications (same type as current)', () => {
    const out = validateReclassify(
      {
        reclassifications: [
          { id: 'e3', newType: 'concepto' }, // already concepto
          { id: 'e1', newType: 'banda' },
        ],
      },
      ENTITIES,
      VALID_TYPES,
    )
    expect(out.map((r) => r.id)).toEqual(['e1'])
  })

  it('handles missing or malformed input', () => {
    expect(validateReclassify(null, ENTITIES, VALID_TYPES)).toEqual([])
    expect(validateReclassify({}, ENTITIES, VALID_TYPES)).toEqual([])
    expect(
      validateReclassify({ reclassifications: 'not-an-array' }, ENTITIES, VALID_TYPES),
    ).toEqual([])
    expect(
      validateReclassify(
        { reclassifications: [{ no_id: true }, { id: 'e1' /* no newType */ }] },
        ENTITIES,
        VALID_TYPES,
      ),
    ).toEqual([])
  })

  it('reason is optional', () => {
    const out = validateReclassify(
      { reclassifications: [{ id: 'e1', newType: 'banda' }] },
      ENTITIES,
      VALID_TYPES,
    )
    expect(out[0].reason).toBeUndefined()
  })

  it('trims empty-string reasons to undefined', () => {
    const out = validateReclassify(
      { reclassifications: [{ id: 'e1', newType: 'banda', reason: '   ' }] },
      ENTITIES,
      VALID_TYPES,
    )
    expect(out[0].reason).toBeUndefined()
  })
})
