import { describe, expect, it } from 'vitest'
import { validateExtraction } from './extract-validate'

const EXISTING = [
  { id: 'e-camus', name: 'Albert Camus', type: 'persona' },
  { id: 'e-extranjero', name: 'El extranjero', type: 'libro' },
]

const ENTITY_TYPES = new Set([
  'persona',
  'libro',
  'cancion',
  'album',
  'pelicula',
  'obra',
  'concepto',
  'idea',
])
const RELATIONSHIP_TYPES = new Set([
  'influye_en',
  'cita_a',
  'responde_a',
  'me_llego_por',
  'suena_como',
  'inspira',
  'contradice',
  'asociado_con',
])

function v(raw: unknown, existing = EXISTING) {
  return validateExtraction(raw, existing, ENTITY_TYPES, RELATIONSHIP_TYPES)
}

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
        {
          entityName: 'Iris Murdoch',
          text: 'love is the difficult realization that something other than oneself is real',
        },
      ],
    }

    const result = v(raw)

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
    const result = v(raw)
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
    const result = v(raw)
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
    const result = v(raw)
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
    const result = v(raw)
    expect(result.relationships).toHaveLength(1)
  })

  it('drops self-loops (from = to)', () => {
    const raw = {
      relationships: [
        { fromName: 'Camus', toName: 'Camus', type: 'cita_a' },
        { fromName: 'Camus', toName: 'CAMUS', type: 'influye_en' }, // case-insensitive
      ],
    }
    const result = v(raw)
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
    const result = v(raw)
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
    const result = v(raw)
    expect(result.quotes).toHaveLength(1)
    expect(result.quotes[0].text).toBe('real quote')
  })

  it('drops quotes missing entityName', () => {
    const raw = {
      quotes: [{ text: 'orphan quote' }],
    }
    const result = v(raw)
    expect(result.quotes).toHaveLength(0)
  })
})

describe('validateExtraction — garbage in, structured out', () => {
  it('returns empty arrays when input is null', () => {
    const result = v(null)
    expect(result).toEqual({
      entities: [],
      relationships: [],
      quotes: [],
      edits: [],
      deletes: [],
    })
  })

  it('returns empty arrays when input is wrong shape', () => {
    const result = v({ entities: 'not an array' })
    expect(result.entities).toEqual([])
  })

  it('returns empty arrays when input is a string', () => {
    const result = v('garbage')
    expect(result).toEqual({
      entities: [],
      relationships: [],
      quotes: [],
      edits: [],
      deletes: [],
    })
  })

  it('returns empty arrays when input is an array directly', () => {
    const result = v([1, 2, 3])
    expect(result).toEqual({
      entities: [],
      relationships: [],
      quotes: [],
      edits: [],
      deletes: [],
    })
  })

  it('handles empty input gracefully', () => {
    const result = v({})
    expect(result).toEqual({
      entities: [],
      relationships: [],
      quotes: [],
      edits: [],
      deletes: [],
    })
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
    const result = v(raw)
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
    const result = v(raw)
    expect(result.entities[0].year).toBeUndefined()
  })

  it('converts empty-string optional fields to undefined', () => {
    const raw = {
      entities: [{ type: 'persona', name: 'X', description: '   ' }],
    }
    const result = v(raw)
    expect(result.entities[0].description).toBeUndefined()
  })
})
