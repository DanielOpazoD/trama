import { describe, expect, it } from 'vitest'
import { buildAskPrompt, type AskContext } from './ask-prompt'

const EMPTY_CTX: AskContext = {
  view: 'citas',
  entities: [],
  relationships: [],
  recentQuotes: [],
  entityTypes: ['libro', 'cancion'],
  relationshipTypes: ['influye_en'],
  selectedEntity: null,
}

describe('buildAskPrompt — history', () => {
  it('returns only system + user when no history is provided', () => {
    const msgs = buildAskPrompt('hola', EMPTY_CTX)
    expect(msgs.length).toBe(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[1]).toEqual({ role: 'user', content: 'hola' })
  })

  it('inserts prior turns between system and the new user message', () => {
    const msgs = buildAskPrompt('y por qué?', {
      ...EMPTY_CTX,
      history: [
        { role: 'user', content: '¿qué te dice esto?' },
        { role: 'assistant', content: 'Me suena a Borges.' },
      ],
    })
    expect(msgs.length).toBe(4)
    expect(msgs[0].role).toBe('system')
    expect(msgs[1]).toEqual({ role: 'user', content: '¿qué te dice esto?' })
    expect(msgs[2]).toEqual({ role: 'assistant', content: 'Me suena a Borges.' })
    expect(msgs[3]).toEqual({ role: 'user', content: 'y por qué?' })
  })

  it('strips TRAMA-PROPOSAL blocks from past assistant turns', () => {
    const msgs = buildAskPrompt('sigamos', {
      ...EMPTY_CTX,
      history: [
        { role: 'user', content: 'agrega Borges' },
        {
          role: 'assistant',
          content: 'Listo. <<<TRAMA-PROPOSAL\n{ "entities": [] }\nTRAMA-PROPOSAL>>>',
        },
      ],
    })
    const assistant = msgs.find((m) => m.role === 'assistant')
    expect(assistant?.content).toBe('Listo.')
    expect(assistant?.content).not.toMatch(/TRAMA-PROPOSAL/)
  })

  it('preserves user turn content verbatim (no proposal stripping needed)', () => {
    const msgs = buildAskPrompt('continúa', {
      ...EMPTY_CTX,
      history: [
        { role: 'user', content: 'pega: <<<TRAMA-PROPOSAL {} TRAMA-PROPOSAL>>>' },
      ],
    })
    const userPrior = msgs.find(
      (m) => m.role === 'user' && m.content.includes('TRAMA-PROPOSAL'),
    )
    expect(userPrior).toBeTruthy()
  })
})
