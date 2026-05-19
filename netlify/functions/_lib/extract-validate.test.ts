import { describe, expect, it } from 'vitest'
import { validateExtraction } from './extract-validate'

const EXISTING = [
  { id: 'e-camus', name: 'Albert Camus', type: 'persona' },
  { id: 'e-extranjero', name: 'El extranjero', type: 'libro' },
]

describe('validateExtraction — happy path', () => {
  it('accepts well-formed proposal and returns it cleaned', () => {
    const raw = {
      entities: [
        { type: 'persona', name: 'Iris Murdoch', year: 1919 },
        { type: 'concepto', name: 'atención', description: 'forma de mirar lenta' },
      ],
      relationships: [
        { fromName: 'Iris Murdoch', toName: 'atención', type: 'asociado_con' },
      ],
      quotes: [
        { entityName: 'Iris Murdoch', text: 'love is the difficult realization that something other than oneself is real' },
      ],
    }

    const result = validateExtraction(raw, EXISTING)

    expect(result.entities).toHaveLength(2)
    expect(result.entities[0].name).toBe('Iris Murdoch')
    expect(result.entities[0].matchedId).toBeUndefined()
    expect(result.relationships).toHaveLength(1)
    expect(result.quotes).toHaveLength(1)
  })

  it('marks entities that match existing ones', () => {
    const raw = {
      entities: [{ type: 'persona', name: 'albert camus' }], // different case
    }
    const result = validateExtraction(raw, EXISTING)
    expect(result.entities[0].matchedId).toBe('e-camus')
  })
})

describe('validateExtraction — invalid entity type', () => {
  it('drops entities with unknown types', () => {
    const raw = {
      entities: [
        { type: 'persona', name: 'Borges' },
        { type: 'invalid_type', name: 'Whatever' },
      ],
    }
    const result = validateExtraction(raw, EXISTING)
    expect(result.entities).toHaveLength(1)
    expect(result.entities[0].name).toBe('Borges')
  })

  it('drops entities missing name or type', () => {
    const raw = {
      entities: [
        { type: 'persona' }, // no name
        { name: 'NoType' }, // no type
        { type: 'persona', name: 'OK' },
      ],
    }
    const result = validateExtraction(raw, EXISTING)
    expect(result.entities).toHaveLength(1)
    expect(result.entities[0].name).toBe('OK')
  })
})

describe('validateExtraction — invalid relationship', () => {
  it('drops relationships with unknown type', () => {
    const raw = {
      relationships: [
        { fromName: 'A', toName: 'B', type: 'influye_en' },
        { fromName: 'A', toName: 'B', type: 'random_thing' },
      ],
    }
    const result = validateExtraction(raw, EXISTING)
    expect(result.relationships).toHaveLength(1)
  })

  it('drops self-loops (from = to)', () => {
    const raw = {
      relationships: [
        { fromName: 'Camus', toName: 'Camus', type: 'cita_a' },
        { fromName: 'Camus', toName: 'CAMUS', type: 'influye_en' }, // case-insensitive
      ],
    }
    const result = validateExtraction(raw, EXISTING)
    expect(result.relationships).toHaveLength(0)
  })

  it('drops relationships with missing fields', () => {
    const raw = {
      relationships: [
        { fromName: 'A', type: 'influye_en' }, // no toName
        { toName: 'B', type: 'influye_en' }, // no fromName
        { fromName: 'A', toName: 'B' }, // no type
      ],
    }
    const result = validateExtraction(raw, EXISTING)
    expect(result.relationships).toHaveLength(0)
  })
})

describe('validateExtraction — invalid quote', () => {
  it('drops quotes with empty or missing text', () => {
    const raw = {
      quotes: [
        { entityName: 'Camus', text: '' },
        { entityName: 'Camus' }, // no text
        { entityName: 'Camus', text: '   ' }, // whitespace only
        { entityName: 'Camus', text: 'real quote' },
      ],
    }
    const result = validateExtraction(raw, EXISTING)
    expect(result.quotes).toHaveLength(1)
    expect(result.quotes[0].text).toBe('real quote')
  })

  it('drops quotes missing entityName', () => {
    const raw = {
      quotes: [{ text: 'orphan quote' }],
    }
    const result = validateExtraction(raw, EXISTING)
    expect(result.quotes).toHaveLength(0)
  })
})

describe('validateExtraction — garbage in, structured out', () => {
  it('returns empty arrays when input is null', () => {
    const result = validateExtraction(null, EXISTING)
    expect(result).toEqual({ entities: [], relationships: [], quotes: [] })
  })

  it('returns empty arrays when input is wrong shape', () => {
    const result = validateExtraction({ entities: 'not an array' }, EXISTING)
    expect(result.entities).toEqual([])
  })

  it('returns empty arrays when input is a string', () => {
    const result = validateExtraction('garbage', EXISTING)
    expect(result).toEqual({ entities: [], relationships: [], quotes: [] })
  })

  it('returns empty arrays when input is an array directly', () => {
    const result = validateExtraction([1, 2, 3], EXISTING)
    expect(result).toEqual({ entities: [], relationships: [], quotes: [] })
  })

  it('handles empty input gracefully', () => {
    const result = validateExtraction({}, EXISTING)
    expect(result).toEqual({ entities: [], relationships: [], quotes: [] })
  })
})

describe('validateExtraction — field trimming and coercion', () => {
  it('trims names and texts', () => {
    const raw = {
      entities: [{ type: 'persona', name: '  Camus  ' }],
      relationships: [
        { fromName: '  A  ', toName: '  B  ', type: 'influye_en', notes: '  note  ' },
      ],
      quotes: [{ entityName: '  Camus  ', text: '  quote  ', source: '  src  ' }],
    }
    const result = validateExtraction(raw, EXISTING)
    expect(result.entities[0].name).toBe('Camus')
    expect(result.relationships[0].fromName).toBe('A')
    expect(result.relationships[0].notes).toBe('note')
    expect(result.quotes[0].text).toBe('quote')
    expect(result.quotes[0].source).toBe('src')
  })

  it('drops year if not a number', () => {
    const raw = {
      entities: [{ type: 'persona', name: 'X', year: 'not-a-number' }],
    }
    const result = validateExtraction(raw, EXISTING)
    expect(result.entities[0].year).toBeUndefined()
  })

  it('converts empty-string optional fields to undefined', () => {
    const raw = {
      entities: [{ type: 'persona', name: 'X', description: '   ' }],
    }
    const result = validateExtraction(raw, EXISTING)
    expect(result.entities[0].description).toBeUndefined()
  })
})
