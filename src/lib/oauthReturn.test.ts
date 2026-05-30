import { afterEach, describe, expect, it } from 'vitest'
import { clearOAuthReturn, describeOAuthReturn, readOAuthReturn } from './oauthReturn'

function setUrl(search: string) {
  window.history.replaceState({}, '', `/${search}`)
}

describe('oauthReturn', () => {
  afterEach(() => setUrl(''))

  it('lee x=connected como éxito', () => {
    setUrl('?x=connected')
    expect(readOAuthReturn()).toEqual({ provider: 'x', ok: true, code: null })
  })

  it('lee x_error como fallo con el código', () => {
    setUrl('?x_error=state_mismatch')
    expect(readOAuthReturn()).toEqual({
      provider: 'x',
      ok: false,
      code: 'state_mismatch',
    })
  })

  it('lee el retorno de spotify', () => {
    setUrl('?spotify=connected')
    expect(readOAuthReturn()).toEqual({ provider: 'spotify', ok: true, code: null })
  })

  it('devuelve null sin params OAuth (no confunde ?view=)', () => {
    setUrl('?view=entidades')
    expect(readOAuthReturn()).toBeNull()
  })

  it('clearOAuthReturn quita los params pero conserva el resto', () => {
    setUrl('?view=momentos&x_error=state_mismatch')
    clearOAuthReturn()
    expect(readOAuthReturn()).toBeNull()
    expect(window.location.search).toBe('?view=momentos')
  })

  it('describeOAuthReturn: éxito y fallo con pista', () => {
    expect(describeOAuthReturn({ provider: 'x', ok: true, code: null }).ok).toBe(true)
    const fail = describeOAuthReturn({
      provider: 'x',
      ok: false,
      code: 'state_mismatch',
    })
    expect(fail.ok).toBe(false)
    expect(fail.text).toContain('state_mismatch')
  })
})
