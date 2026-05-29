import { describe, it, expect } from 'vitest'
import { isNewOpenAIModel } from './openai-compatible'

describe('isNewOpenAIModel', () => {
  it('detecta los modelos nuevos que exigen max_completion_tokens', () => {
    for (const m of [
      'gpt-5.4-mini',
      'gpt-5.4',
      'gpt-5.5',
      'gpt-5',
      'o1',
      'o3-mini',
      'o4-mini',
    ]) {
      expect(isNewOpenAIModel(m)).toBe(true)
    }
  })

  it('deja los modelos clásicos con max_tokens + temperatura libre', () => {
    for (const m of [
      'gpt-4o-mini',
      'gpt-4o',
      'gpt-4.1-mini',
      'deepseek-chat',
      'deepseek-reasoner',
      '',
    ]) {
      expect(isNewOpenAIModel(m)).toBe(false)
    }
  })
})
