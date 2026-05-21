import { describe, expect, it } from 'vitest'
import {
  buildSuggestRelationshipsPrompt,
  type EntityForSuggest,
} from './suggest-relationships-prompt'

const REL_TYPES = ['influye_en', 'cita_a', 'asociado_con']

const ENTITIES: EntityForSuggest[] = [
  {
    id: 'e-camus',
    name: 'Albert Camus',
    type: 'persona',
    year: 1913,
    description: 'escritor argelino-francés',
    quotes: ['Hay que imaginar a Sísifo feliz.', 'El mundo es absurdo.'],
  },
  {
    id: 'e-sartre',
    name: 'Jean-Paul Sartre',
    type: 'persona',
    year: 1905,
    description: 'filósofo existencialista',
  },
]

describe('buildSuggestRelationshipsPrompt', () => {
  it('returns a system + user message pair', () => {
    const messages = buildSuggestRelationshipsPrompt(ENTITIES, [], REL_TYPES)
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')
  })

  it('lists every entity name and type in the system prompt', () => {
    const [sys] = buildSuggestRelationshipsPrompt(ENTITIES, [], REL_TYPES)
    expect(sys.content).toContain('Albert Camus')
    expect(sys.content).toContain('Jean-Paul Sartre')
    expect(sys.content).toContain('persona')
  })

  it('includes per-entity description and quotes when provided', () => {
    const [sys] = buildSuggestRelationshipsPrompt(ENTITIES, [], REL_TYPES)
    expect(sys.content).toContain('escritor argelino-francés')
    expect(sys.content).toContain('Hay que imaginar a Sísifo feliz')
    expect(sys.content).toContain('El mundo es absurdo')
  })

  it('caps quotes per entity to 5', () => {
    const many = Array.from({ length: 12 }, (_, i) => `cita ${i}`)
    const entities: EntityForSuggest[] = [
      { id: 'x', name: 'X', type: 'persona', quotes: many },
    ]
    const [sys] = buildSuggestRelationshipsPrompt(entities, [], REL_TYPES)
    expect(sys.content).toContain('cita 0')
    expect(sys.content).toContain('cita 4')
    expect(sys.content).not.toContain('cita 5')
    expect(sys.content).not.toContain('cita 11')
  })

  it('lists the valid relationship types', () => {
    const [sys] = buildSuggestRelationshipsPrompt(ENTITIES, [], REL_TYPES)
    expect(sys.content).toContain('influye_en')
    expect(sys.content).toContain('cita_a')
    expect(sys.content).toContain('asociado_con')
  })

  it('lists existing relationships so the model can avoid duplicates', () => {
    const existing = [
      { fromName: 'Albert Camus', toName: 'Jean-Paul Sartre', type: 'influye_en' },
    ]
    const [sys] = buildSuggestRelationshipsPrompt(ENTITIES, existing, REL_TYPES)
    expect(sys.content).toMatch(/Albert Camus.*influye_en.*Jean-Paul Sartre/s)
  })

  it('says "ninguna aún" when no existing relationships', () => {
    const [sys] = buildSuggestRelationshipsPrompt(ENTITIES, [], REL_TYPES)
    expect(sys.content).toContain('ninguna aún')
  })

  it('produces a system prompt that forbids inventing new entities', () => {
    const [sys] = buildSuggestRelationshipsPrompt(ENTITIES, [], REL_TYPES)
    expect(sys.content).toMatch(/no inventes entidades/i)
  })

  it('asks for justification (notes) on each relationship', () => {
    const [sys] = buildSuggestRelationshipsPrompt(ENTITIES, [], REL_TYPES)
    expect(sys.content).toMatch(/notes/i)
    expect(sys.content).toMatch(/justifica|justificación/i)
  })
})
