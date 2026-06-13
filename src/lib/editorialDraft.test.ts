import { describe, expect, it } from 'vitest'
import type { KnowledgeInboxItem } from './knowledgeWorkflow'
import { buildNarrativeProposal } from './editorialDraft'

const ITEMS: KnowledgeInboxItem[] = [
  {
    id: 'recorte:r1',
    source: 'recorte',
    sourceId: 'r1',
    title: 'El taller de la memoria',
    excerpt: 'La memoria no guarda: recompone con cada lectura.',
    meta: 'Otra Parte · citation',
    actionLabel: 'curar recorte',
    urgency: 'media',
    score: 74,
    createdAt: '2026-06-12T10:00:00Z',
    href: 'https://example.com/memoria',
  },
  {
    id: 'suggestion:s1',
    source: 'suggestion',
    sourceId: 's1',
    title: 'Relación sugerida: Borges → Ficciones',
    excerpt: 'Aparecen juntos varias veces.',
    meta: 'relación · openai',
    actionLabel: 'revisar sugerencia',
    urgency: 'alta',
    score: 92,
    createdAt: '2026-06-12T11:00:00Z',
  },
]

describe('editorial draft proposal', () => {
  it('propone tesis, estructura y huecos desde la mesa de lectura', () => {
    const proposal = buildNarrativeProposal(ITEMS)

    expect(proposal.thesis).toContain('El taller de la memoria')
    expect(proposal.thesis).toContain('Relación sugerida: Borges → Ficciones')
    expect(proposal.outline).toHaveLength(3)
    expect(proposal.outline.map((section) => section.title)).toEqual([
      '1. Punto de entrada',
      '2. Nudo de lectura',
      '3. Salida posible',
    ])
    expect(proposal.gaps).toContain('Añadir al menos una cita textual ya curada.')
    expect(proposal.gaps).toContain(
      'Confirmar las entidades centrales antes de exportar.',
    )
  })

  it('devuelve una propuesta vacía accionable sin materiales', () => {
    expect(buildNarrativeProposal([])).toMatchObject({
      thesis: 'Selecciona materiales para que Trama proponga un hilo de escritura.',
      outline: [],
      gaps: ['Añadir materiales a la mesa de lectura.'],
    })
  })
})
