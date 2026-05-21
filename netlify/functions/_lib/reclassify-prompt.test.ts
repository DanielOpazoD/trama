import { describe, expect, it } from 'vitest'
import {
  buildReclassifyPrompt,
  type EntityForReclassify,
} from './reclassify-prompt'

const TYPES = [
  { slug: 'persona', label: 'persona' },
  { slug: 'banda', label: 'banda / grupo' },
  { slug: 'escritor', label: 'escritor' },
]

const ENTITIES: EntityForReclassify[] = [
  {
    id: 'e1',
    name: 'Pink Floyd',
    type: 'persona',
    description: 'banda inglesa de rock progresivo',
  },
  {
    id: 'e2',
    name: 'Iris Murdoch',
    type: 'persona',
    year: 1919,
    quotes: ['La atención es la forma más rara de la generosidad.'],
  },
]

describe('buildReclassifyPrompt', () => {
  it('returns system + user messages', () => {
    const msgs = buildReclassifyPrompt(ENTITIES, TYPES)
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[1].role).toBe('user')
  })

  it('lists every catalog type with slug and label', () => {
    const [sys] = buildReclassifyPrompt(ENTITIES, TYPES)
    expect(sys.content).toContain('banda')
    expect(sys.content).toContain('banda / grupo')
    expect(sys.content).toContain('escritor')
  })

  it('lists each entity with its current type, name, and description', () => {
    const [sys] = buildReclassifyPrompt(ENTITIES, TYPES)
    expect(sys.content).toContain('Pink Floyd')
    expect(sys.content).toContain('tipo actual: persona')
    expect(sys.content).toContain('banda inglesa de rock progresivo')
  })

  it('includes the entity id so the model can reference it back', () => {
    const [sys] = buildReclassifyPrompt(ENTITIES, TYPES)
    expect(sys.content).toContain('id=e1')
    expect(sys.content).toContain('id=e2')
  })

  it('includes up to 3 quotes per entity', () => {
    const many = Array.from({ length: 8 }, (_, i) => `q${i}`)
    const e: EntityForReclassify[] = [
      { id: 'x', name: 'X', type: 'persona', quotes: many },
    ]
    const [sys] = buildReclassifyPrompt(e, TYPES)
    expect(sys.content).toContain('q0')
    expect(sys.content).toContain('q2')
    expect(sys.content).not.toContain('q3')
    expect(sys.content).not.toContain('q7')
  })

  it('tells the model to be conservative and only flag clear improvements', () => {
    const [sys] = buildReclassifyPrompt(ENTITIES, TYPES)
    expect(sys.content).toMatch(/conservador/i)
  })

  it('demands the new type be from the catalog', () => {
    const [sys] = buildReclassifyPrompt(ENTITIES, TYPES)
    expect(sys.content).toMatch(/cat[áa]logo/i)
  })
})
