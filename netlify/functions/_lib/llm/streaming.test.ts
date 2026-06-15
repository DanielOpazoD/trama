import { describe, expect, it } from 'vitest'

import { parseOpenAICompatibleSseBlock } from './streaming'

describe('parseOpenAICompatibleSseBlock', () => {
  it('extrae deltas de contenido y usage desde un bloque SSE', () => {
    const frames = parseOpenAICompatibleSseBlock(
      [
        'event: completion',
        'data: {"choices":[{"delta":{"content":"hola"}}]}',
        'data: {"usage":{"prompt_tokens":12,"completion_tokens":4}}',
      ].join('\n'),
    )

    expect(frames).toEqual([{ content: 'hola' }, { tokensIn: 12, tokensOut: 4 }])
  })

  it('ignora payloads incompletos, [DONE] y JSON inválido', () => {
    const frames = parseOpenAICompatibleSseBlock(
      ['data: [DONE]', 'data: {nope', 'event: ping', 'data: {}'].join('\n'),
    )

    expect(frames).toEqual([])
  })

  it('preserva usage parcial sin inventar ceros', () => {
    const frames = parseOpenAICompatibleSseBlock('data: {"usage":{"prompt_tokens":12}}')

    expect(frames).toEqual([{ tokensIn: 12, tokensOut: undefined }])
  })
})
