import { describe, expect, it } from 'vitest'
import { parseAIMode } from './ai-mode'

describe('parseAIMode', () => {
  it('defaults to auto when header is missing or empty', () => {
    expect(parseAIMode(null)).toEqual({ kind: 'auto' })
    expect(parseAIMode(undefined)).toEqual({ kind: 'auto' })
    expect(parseAIMode('')).toEqual({ kind: 'auto' })
  })

  it('recognizes "off"', () => {
    expect(parseAIMode('off')).toEqual({ kind: 'off' })
    expect(parseAIMode(' OFF ')).toEqual({ kind: 'off' })
  })

  it('recognizes explicit auto', () => {
    expect(parseAIMode('auto')).toEqual({ kind: 'auto' })
  })

  it('parses forced:<provider> for known providers', () => {
    expect(parseAIMode('forced:deepseek')).toEqual({
      kind: 'forced',
      provider: 'deepseek',
    })
    expect(parseAIMode('forced:openai')).toEqual({
      kind: 'forced',
      provider: 'openai',
    })
    expect(parseAIMode('FORCED:Anthropic')).toEqual({
      kind: 'forced',
      provider: 'anthropic',
    })
  })

  it('falls back to auto when the forced provider is unknown', () => {
    expect(parseAIMode('forced:cohere')).toEqual({ kind: 'auto' })
    expect(parseAIMode('forced:')).toEqual({ kind: 'auto' })
    expect(parseAIMode('garbage')).toEqual({ kind: 'auto' })
  })
})
