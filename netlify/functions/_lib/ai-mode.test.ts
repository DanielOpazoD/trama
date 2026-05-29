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

  it('parses forced:<provider> for known providers (model null = default)', () => {
    expect(parseAIMode('forced:deepseek')).toEqual({
      kind: 'forced',
      provider: 'deepseek',
      model: null,
    })
    expect(parseAIMode('forced:openai')).toEqual({
      kind: 'forced',
      provider: 'openai',
      model: null,
    })
    expect(parseAIMode('FORCED:Anthropic')).toEqual({
      kind: 'forced',
      provider: 'anthropic',
      model: null,
    })
  })

  it('parses forced:<provider>:<model> for a forced model', () => {
    expect(parseAIMode('forced:openai:gpt-5.4')).toEqual({
      kind: 'forced',
      provider: 'openai',
      model: 'gpt-5.4',
    })
    expect(parseAIMode('forced:deepseek:deepseek-reasoner')).toEqual({
      kind: 'forced',
      provider: 'deepseek',
      model: 'deepseek-reasoner',
    })
    // Provider en mayúsculas se normaliza; el modelo se conserva.
    expect(parseAIMode('forced:Gemini:gemini-2.5-pro')).toEqual({
      kind: 'forced',
      provider: 'gemini',
      model: 'gemini-2.5-pro',
    })
  })

  it('treats an empty model suffix as the default model (null)', () => {
    expect(parseAIMode('forced:openai:')).toEqual({
      kind: 'forced',
      provider: 'openai',
      model: null,
    })
  })

  it('falls back to auto when the forced provider is unknown', () => {
    expect(parseAIMode('forced:cohere')).toEqual({ kind: 'auto' })
    expect(parseAIMode('forced:cohere:some-model')).toEqual({ kind: 'auto' })
    expect(parseAIMode('forced:')).toEqual({ kind: 'auto' })
    expect(parseAIMode('garbage')).toEqual({ kind: 'auto' })
  })
})
