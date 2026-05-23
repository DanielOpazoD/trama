import { describe, expect, it } from 'vitest'
import { buildProactivePrompt, type DismissedSuggestion } from './proactive-prompt'

const entities = [
  {
    id: 'e1',
    name: 'Borges',
    type: 'escritor',
    year: 1899,
    description: null,
    quotes: [],
  },
]
const rels = [{ fromName: 'Borges', toName: 'Bioy', type: 'cita_a' }]
const entityTypes = ['escritor', 'musico']
const relTypes = ['cita_a', 'influye_en']

describe('buildProactivePrompt', () => {
  it('does not include a "dismissed" block when none provided', () => {
    const [system] = buildProactivePrompt(entities, rels, entityTypes, relTypes)
    expect(system.content).not.toMatch(/YA DESCARTÓ/)
  })

  it('renders human-readable summaries for each dismissed kind', () => {
    const dismissed: DismissedSuggestion[] = [
      { kind: 'relationship', summary: 'Borges → cita_a → Bioy' },
      { kind: 'reclassification', summary: 'Soda Stereo: musico → banda' },
      { kind: 'description', summary: 'descripción para "Cortázar"' },
    ]
    const [system] = buildProactivePrompt(entities, rels, entityTypes, relTypes, dismissed)
    expect(system.content).toMatch(/YA DESCARTÓ/)
    expect(system.content).toMatch(/Borges → cita_a → Bioy/)
    expect(system.content).toMatch(/Soda Stereo: musico → banda/)
    expect(system.content).toMatch(/descripción para "Cortázar"/)
  })

  it('caps the dismissed list at 60 items', () => {
    const dismissed: DismissedSuggestion[] = Array.from({ length: 80 }, (_, i) => ({
      kind: 'relationship',
      summary: `sug-${i}`,
    }))
    const [system] = buildProactivePrompt(entities, rels, entityTypes, relTypes, dismissed)
    const content = String(system.content)
    expect(content).toMatch(/sug-0\b/)
    expect(content).toMatch(/sug-59\b/)
    expect(content).not.toMatch(/sug-60\b/)
    expect(content).not.toMatch(/sug-79\b/)
  })

  it('lists the entity catalog and existing relationships verbatim', () => {
    const [system] = buildProactivePrompt(entities, rels, entityTypes, relTypes)
    expect(system.content).toMatch(/id=e1 \| "Borges"/)
    expect(system.content).toMatch(/Borges → cita_a → Bioy/)
  })
})
