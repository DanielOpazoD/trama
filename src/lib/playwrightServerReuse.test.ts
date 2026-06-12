import { describe, expect, it } from 'vitest'
import { shouldReusePlaywrightServer } from './playwrightServerReuse'

describe('shouldReusePlaywrightServer', () => {
  it('does not reuse local servers by default', () => {
    expect(shouldReusePlaywrightServer({})).toBe(false)
  })

  it('reuses local servers only with explicit opt-in outside CI', () => {
    expect(shouldReusePlaywrightServer({ reuseServer: '1' })).toBe(true)
    expect(shouldReusePlaywrightServer({ reuseServer: 'true' })).toBe(false)
  })

  it('never reuses an existing server in CI', () => {
    expect(shouldReusePlaywrightServer({ ci: 'true', reuseServer: '1' })).toBe(false)
  })
})
