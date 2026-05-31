import { describe, expect, it } from 'vitest'
import { buildChatPrompt, type ChatTramaContext } from './chat-prompt'

const EMPTY_CONTEXT: ChatTramaContext = {
  entities: [],
  relationships: [],
  quotes: [],
}

describe('buildChatPrompt', () => {
  it('strips stale TRAMA-PROPOSAL blocks from assistant history', () => {
    const messages = buildChatPrompt(
      [
        { role: 'user', content: 'agrega a Borges' },
        {
          role: 'assistant',
          content:
            'Lo dejaría como una presencia axial.\n<<<TRAMA-PROPOSAL\n{ "entities": [{ "name": "Borges", "type": "escritor" }] }\nTRAMA-PROPOSAL>>>',
        },
      ],
      EMPTY_CONTEXT,
      ['influye_en'],
      ['escritor'],
    )

    expect(messages).toHaveLength(3)
    expect(messages[2]).toEqual({
      role: 'assistant',
      content: 'Lo dejaría como una presencia axial.',
    })
    expect(messages[2].content).not.toContain('TRAMA-PROPOSAL')
  })
})
