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

describe('deriveThreadTitle', () => {
  it('devuelve la pregunta entera si es corta', async () => {
    const { deriveThreadTitle } = await import('./chat-prompt')
    expect(deriveThreadTitle('¿Qué une a Borges con el sur?')).toBe(
      '¿Qué une a Borges con el sur?',
    )
  })

  it('colapsa whitespace y saltos de línea', async () => {
    const { deriveThreadTitle } = await import('./chat-prompt')
    expect(deriveThreadTitle('  hola\n\n  mundo  ')).toBe('hola mundo')
  })

  it('trunca en límite de palabra con elipsis, sin puntuación colgante', async () => {
    const { deriveThreadTitle } = await import('./chat-prompt')
    const long =
      '¿Podrías explicarme en detalle qué relación hay entre la melancolía, el tango y la literatura argentina del siglo veinte?'
    const title = deriveThreadTitle(long)
    expect(title.length).toBeLessThanOrEqual(57)
    expect(title.endsWith('…')).toBe(true)
    // No corta una palabra a la mitad: lo anterior a la elipsis es prefijo
    // de la pregunta terminado en palabra completa.
    const head = title.slice(0, -1)
    expect(long.startsWith(head)).toBe(true)
    expect(long[head.length]).toBe(' ')
  })

  it('corte duro si no hay espacios útiles', async () => {
    const { deriveThreadTitle } = await import('./chat-prompt')
    const noSpaces = 'a'.repeat(120)
    const title = deriveThreadTitle(noSpaces)
    expect(title).toBe('a'.repeat(56) + '…')
  })

  it('vacío para entrada vacía', async () => {
    const { deriveThreadTitle } = await import('./chat-prompt')
    expect(deriveThreadTitle('   ')).toBe('')
  })
})
