import { describe, expect, it } from 'vitest'
import { shouldUseClerk } from './clerkRuntime'

describe('shouldUseClerk', () => {
  it('disables Clerk without a publishable key', () => {
    expect(shouldUseClerk({ publishableKey: '' })).toBe(false)
    expect(shouldUseClerk({})).toBe(false)
  })

  it('enables Clerk when a publishable key exists', () => {
    expect(shouldUseClerk({ publishableKey: 'pk_test_trama' })).toBe(true)
  })

  it('keeps E2E runs independent from real Clerk env state', () => {
    expect(
      shouldUseClerk({
        e2eBypass: '1',
        publishableKey: 'pk_test_trama',
      }),
    ).toBe(false)
  })
})
