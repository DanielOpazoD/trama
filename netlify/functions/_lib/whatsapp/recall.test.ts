import { describe, expect, it } from 'vitest'
import type { RagContext } from '../rag-context'
import {
  buildRecallPrompt,
  formatRecallAnswer,
  formatRecallFallback,
  recallHasResults,
} from './recall'

const ORIGIN = 'https://trama.test'

function ctx(partial: Partial<RagContext>): RagContext {
  return {
    entities: [],
    relationships: [],
    quotes: [],
    usedRag: true,
    ...partial,
  }
}

describe('recallHasResults', () => {
  it('true si hay entidades o citas', () => {
    expect(
      recallHasResults(
        ctx({
          entities: [
            { id: 'e1', name: 'Borges', type: 'persona', year: null, description: null },
          ],
        }),
      ),
    ).toBe(true)
    expect(recallHasResults(ctx({}))).toBe(false)
  })

  it('true si solo hay relaciones (sin entidades/citas)', () => {
    expect(
      recallHasResults(
        ctx({
          relationships: [
            {
              id: 'r1',
              from_name: 'Borges',
              to_name: 'Bioy Casares',
              type: 'influye_en',
              notes: null,
            },
          ],
        }),
      ),
    ).toBe(true)
  })
})

describe('buildRecallPrompt', () => {
  it('mete entidades y citas en el contexto y prohíbe inventar', () => {
    const msgs = buildRecallPrompt(
      '¿qué tengo de Borges?',
      ctx({
        entities: [
          {
            id: 'e1',
            name: 'Borges',
            type: 'escritor',
            year: 1899,
            description: 'Cuentos infinitos',
          },
        ],
        quotes: [
          {
            id: 'q1',
            entity_name: 'Borges',
            text: 'El tiempo es la sustancia',
            source: null,
          },
        ],
      }),
    )
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('SOLO el contexto')
    expect(msgs[1].content).toContain('Borges')
    expect(msgs[1].content).toContain('El tiempo es la sustancia')
    expect(msgs[1].content).toContain('¿qué tengo de Borges?')
  })
})

describe('formatRecallAnswer', () => {
  it('antepone 🔎 y agrega deep links según el contexto', () => {
    const out = formatRecallAnswer(
      'Tienes a Borges y una cita suya.',
      ctx({
        entities: [
          { id: 'e1', name: 'Borges', type: 'escritor', year: null, description: null },
        ],
        quotes: [{ id: 'q1', entity_name: 'Borges', text: 'x', source: null }],
      }),
      ORIGIN,
    )
    expect(out).toContain('🔎 Tienes a Borges')
    expect(out).toContain('view=entidades')
    expect(out).toContain('view=citas')
  })
})

describe('formatRecallFallback', () => {
  it('lista resultados con deep links cuando no hay LLM', () => {
    const out = formatRecallFallback(
      ctx({
        entities: [
          { id: 'e1', name: 'Borges', type: 'escritor', year: null, description: null },
        ],
      }),
      ORIGIN,
    )
    expect(out).toContain('Esto encontré')
    expect(out).toContain('Borges')
    expect(out).toContain('view=entidades')
  })
})
