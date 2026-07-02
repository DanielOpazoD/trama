import { describe, expect, it } from 'vitest'
import { buildLLMCacheScope } from './cache-policy'

describe('llm cache policy', () => {
  it('construye scopes estables por provider/model/mode', () => {
    expect(
      buildLLMCacheScope({
        provider: 'deepseek',
        model: 'deepseek-chat',
        mode: 'json',
      }),
    ).toBe('deepseek|deepseek-chat|json|')
  })

  it('incluye freshNonce para saltar cache entre llamadas intencionalmente frescas', () => {
    expect(
      buildLLMCacheScope({
        provider: 'openai',
        model: 'gpt-4o-mini',
        mode: 'text',
        freshNonce: 'click-2',
      }),
    ).toBe('openai|gpt-4o-mini|text|click-2')
  })
})
