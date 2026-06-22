import { describe, expect, it } from 'vitest'
import { XBookmarksResponse, XProfileResponse, XTokenResponse } from './x/schemas'

/**
 * E5 — Validación Zod de las respuestas de la API de X (Twitter). Happy path +
 * shape rota que falla ruidoso (ZodError) en vez de propagar undefined.
 */

describe('XTokenResponse', () => {
  it('acepta token con scope/refresh_token opcionales', () => {
    const full = {
      access_token: 'at',
      refresh_token: 'rt',
      token_type: 'bearer',
      scope: 'bookmark.read',
      expires_in: 7200,
    }
    expect(XTokenResponse.parse(full)).toMatchObject({ access_token: 'at' })

    // X no siempre reenvía scope ni refresh_token.
    expect(
      XTokenResponse.parse({ access_token: 'at', token_type: 'bearer', expires_in: 7200 })
        .scope,
    ).toBeUndefined()
  })

  it('falla ruidoso sin access_token o con expires_in no numérico', () => {
    expect(() =>
      XTokenResponse.parse({ token_type: 'bearer', expires_in: 7200 }),
    ).toThrow()
    expect(() =>
      XTokenResponse.parse({
        access_token: 'at',
        token_type: 'bearer',
        expires_in: 'pronto',
      }),
    ).toThrow()
  })

  it('exige expires_in entero positivo (OAuth2)', () => {
    const base = { access_token: 'at', token_type: 'bearer' }
    expect(() => XTokenResponse.parse({ ...base, expires_in: 0 })).toThrow()
    expect(() => XTokenResponse.parse({ ...base, expires_in: -5 })).toThrow()
    expect(() => XTokenResponse.parse({ ...base, expires_in: 1.5 })).toThrow()
    expect(XTokenResponse.parse({ ...base, expires_in: 7200 }).expires_in).toBe(7200)
  })
})

describe('XProfileResponse', () => {
  it('acepta el perfil envuelto en data', () => {
    const parsed = XProfileResponse.parse({
      data: { id: 'x1', username: 'daniel', name: 'Daniel' },
    })
    expect(parsed.data?.username).toBe('daniel')
  })

  it('acepta respuesta sin data (lo maneja el caller → null)', () => {
    expect(XProfileResponse.parse({}).data).toBeUndefined()
  })

  it('falla ruidoso si data viene sin id/username', () => {
    expect(() => XProfileResponse.parse({ data: { username: 'daniel' } })).toThrow()
    expect(() => XProfileResponse.parse({ data: { id: 'x1' } })).toThrow()
  })
})

describe('XBookmarksResponse', () => {
  it('acepta data + includes.users', () => {
    const parsed = XBookmarksResponse.parse({
      data: [{ id: 't1', text: 'hola', author_id: 'a1' }],
      includes: { users: [{ id: 'a1', username: 'autor', name: 'Autor' }] },
    })
    expect(parsed.data?.[0]?.text).toBe('hola')
    expect(parsed.includes?.users?.[0]?.username).toBe('autor')
  })

  it('acepta respuesta vacía (sin bookmarks)', () => {
    expect(XBookmarksResponse.parse({}).data).toBeUndefined()
  })

  it('falla ruidoso si un tweet no trae id o text (contrato roto)', () => {
    expect(() => XBookmarksResponse.parse({ data: [{ text: 'sin id' }] })).toThrow()
    expect(() => XBookmarksResponse.parse({ data: [{ id: 't1' }] })).toThrow()
  })
})
