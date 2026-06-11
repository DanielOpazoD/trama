import { describe, it, expect } from 'vitest'
import {
  buildRecorteSuggestPrompt,
  sanitizeSuggestion,
  type EntityLite,
} from './recorte-suggest-prompt'

const ENTITIES: EntityLite[] = [
  { id: 'e1', name: 'Borges', type: 'escritor' },
  { id: 'e2', name: 'Rayuela', type: 'libro' },
]
const VALID_IDS = new Set(['e1', 'e2'])
const VALID_TYPES = new Set(['escritor', 'libro', 'concepto'])

describe('buildRecorteSuggestPrompt', () => {
  it('incluye texto, fuente, tipos válidos y entidades existentes', () => {
    const [sys, user] = buildRecorteSuggestPrompt(
      'La memoria es un taller.',
      { title: 'El taller', url: 'https://x.com', author: 'Otra Parte' },
      ENTITIES,
      ['escritor', 'libro'],
    )
    expect(sys.role).toBe('system')
    expect(user.content).toMatch(/La memoria es un taller/)
    expect(user.content).toMatch(/El taller/)
    expect(user.content).toMatch(/e1 :: Borges/)
    expect(user.content).toMatch(/escritor, libro/)
  })
})

describe('sanitizeSuggestion', () => {
  it('acepta una sugerencia válida tal cual', () => {
    const out = sanitizeSuggestion(
      {
        target: 'quote',
        title: 'Sobre la memoria',
        rationale: 'Es una frase citable.',
        relatedEntityIds: ['e1'],
        suggestedEntityName: null,
        suggestedEntityType: null,
      },
      VALID_IDS,
      VALID_TYPES,
    )
    expect(out.target).toBe('quote')
    expect(out.relatedEntityIds).toEqual(['e1'])
  })

  it('descarta ids de entidad inventados (no en la lista)', () => {
    const out = sanitizeSuggestion(
      { target: 'quote', relatedEntityIds: ['e1', 'INVENTADO', 'e2'] },
      VALID_IDS,
      VALID_TYPES,
    )
    expect(out.relatedEntityIds).toEqual(['e1', 'e2'])
  })

  it('cae a momento ante target inválido y limpia campos de entidad', () => {
    const out = sanitizeSuggestion(
      { target: 'galaxia', suggestedEntityName: 'X', suggestedEntityType: 'escritor' },
      VALID_IDS,
      VALID_TYPES,
    )
    expect(out.target).toBe('momento')
    expect(out.suggestedEntityName).toBeNull()
    expect(out.suggestedEntityType).toBeNull()
  })

  it('rechaza un tipo de entidad que no está en la lista válida', () => {
    const out = sanitizeSuggestion(
      {
        target: 'entity',
        suggestedEntityName: 'Cortázar',
        suggestedEntityType: 'alienígena',
      },
      VALID_IDS,
      VALID_TYPES,
    )
    expect(out.suggestedEntityName).toBe('Cortázar')
    expect(out.suggestedEntityType).toBeNull()
  })

  it('nunca lanza ante basura total', () => {
    expect(() => sanitizeSuggestion(null, VALID_IDS, VALID_TYPES)).not.toThrow()
    const out = sanitizeSuggestion('no-soy-json', VALID_IDS, VALID_TYPES)
    expect(out.target).toBe('momento')
    expect(out.relatedEntityIds).toEqual([])
  })
})
