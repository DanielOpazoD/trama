import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from '../env'
import {
  X_SCOPES,
  buildAuthUrl,
  disconnectX,
  generatePkce,
  getStoredTokens,
  getValidAccessToken,
  saveTokens,
} from './auth'

/**
 * OAuth2 + PKCE de X. El módulo estaba al 2.17% de cobertura: prácticamente
 * todo el flujo de identidad de X corría sin una sola aserción.
 *
 * Lo que se cubre acá no es "líneas": son los invariantes que, si se rompen,
 * fallan en silencio o abren un agujero — que el challenge sea de verdad el
 * hash del verifier, que cada consulta esté acotada al usuario, y que un
 * refresh no se lleve por delante el token que permite el siguiente.
 */

type SqlTag = Parameters<typeof getStoredTokens>[0]

type Capture = { text: string; values: unknown[] }

function makeSql(responder: (text: string, values: unknown[]) => unknown = () => []) {
  const calls: Capture[] = []
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join(' ')
    calls.push({ text, values })
    return Promise.resolve(responder(text, values))
  }) as SqlTag
  return { sql, calls }
}

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'user-1',
    x_user_id: 'x-1',
    username: 'daniel',
    access_token: 'access-guardado',
    refresh_token: 'refresh-guardado',
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    scopes: X_SCOPES,
    connected_at: new Date().toISOString(),
    last_synced_at: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function stubXEnv() {
  vi.stubEnv('X_CLIENT_ID', 'client-id')
  vi.stubEnv('X_CLIENT_SECRET', 'secreto-que-no-debe-salir')
  vi.stubEnv('X_REDIRECT_URI', 'https://trama.test/api/x/callback')
  // getEnv() cachea; sin esto el stub no llega.
  resetEnvCache()
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetEnvCache()
})

describe('generatePkce', () => {
  /**
   * Si el challenge deja de ser el SHA-256 del verifier, X rechaza el
   * intercambio y conectar la cuenta se vuelve imposible. Lo recalculamos aquí
   * de forma independiente en vez de confiar en que la implementación se
   * llame a sí misma.
   */
  it('el challenge es el SHA-256 del verifier en base64url', async () => {
    const { verifier, challenge } = await generatePkce()

    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(verifier),
    )
    const esperado = Buffer.from(new Uint8Array(digest))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    expect(challenge).toBe(esperado)
  })

  it('el verifier respeta el largo y el alfabeto que exige RFC 7636', async () => {
    const { verifier } = await generatePkce()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
    // base64url puro: sin '+', '/' ni '=' de relleno.
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
  })

  it('no repite el verifier entre llamadas', async () => {
    const [a, b] = await Promise.all([generatePkce(), generatePkce()])
    expect(a.verifier).not.toBe(b.verifier)
  })
})

describe('buildAuthUrl', () => {
  it('pide S256 y lleva el challenge, el state y los scopes', () => {
    stubXEnv()
    const url = new URL(buildAuthUrl('mi-state', 'mi-challenge'))

    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe('mi-challenge')
    expect(url.searchParams.get('state')).toBe('mi-state')
    expect(url.searchParams.get('response_type')).toBe('code')
    // offline.access es lo que habilita el refresh_token; sin él la conexión
    // se muere en cuanto vence el primer access token.
    expect(url.searchParams.get('scope')).toContain('offline.access')
  })

  it('nunca pone el client secret en la URL de autorización', () => {
    stubXEnv()
    // La URL viaja en un redirect visible: sólo el client_id puede ir ahí.
    expect(buildAuthUrl('s', 'c')).not.toContain('secreto-que-no-debe-salir')
  })
})

describe('acotado por usuario', () => {
  it('getStoredTokens filtra por user_id', async () => {
    const { sql, calls } = makeSql(() => [])
    await expect(getStoredTokens(sql, 'user-1')).resolves.toBeNull()
    expect(calls[0]!.text).toMatch(/WHERE user_id =/i)
    expect(calls[0]!.values).toEqual(['user-1'])
  })

  /**
   * Un DELETE sin WHERE aquí borraría los tokens de todos los usuarios. Es una
   * línea de SQL y una sola palabra de distancia.
   */
  it('disconnectX borra sólo la fila del usuario', async () => {
    const { sql, calls } = makeSql()
    await disconnectX(sql, 'user-1')
    expect(calls[0]!.text).toMatch(/DELETE FROM x_tokens\s+WHERE user_id =/i)
    expect(calls[0]!.values).toEqual(['user-1'])
  })

  it('saveTokens conserva el refresh token cuando el nuevo viene nulo', async () => {
    const { sql, calls } = makeSql()
    await saveTokens(
      sql,
      {
        xUserId: 'x-1',
        username: 'daniel',
        accessToken: 'access-nuevo',
        refreshToken: null,
        expiresAt: new Date(),
        scopes: null,
      },
      'user-1',
    )
    expect(calls[0]!.text.replace(/\s+/g, ' ')).toMatch(
      /refresh_token\s*=\s*COALESCE\(EXCLUDED\.refresh_token,\s*x_tokens\.refresh_token\)/i,
    )
  })
})

describe('getValidAccessToken', () => {
  it('devuelve null si el usuario no conectó X', async () => {
    const { sql } = makeSql(() => [])
    await expect(getValidAccessToken(sql, 'user-1')).resolves.toBeNull()
  })

  it('reusa el token guardado si le queda más de un minuto', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { sql } = makeSql((text) =>
      text.includes('FROM x_tokens') ? [storedRow()] : [],
    )
    await expect(getValidAccessToken(sql, 'user-1')).resolves.toBe('access-guardado')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  /**
   * Sin refresh token no hay nada que hacer: devolver null es lo correcto
   * (el caller lo lee como "hay que reconectar"). Lo que NO debe pasar es
   * intentar el refresh igual y reventar con un error de red.
   */
  it('devuelve null si venció y no hay refresh token, sin llamar a X', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { sql } = makeSql((text) =>
      text.includes('FROM x_tokens')
        ? [
            storedRow({
              expires_at: new Date(Date.now() - 1000).toISOString(),
              refresh_token: null,
            }),
          ]
        : [],
    )
    await expect(getValidAccessToken(sql, 'user-1')).resolves.toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('al refrescar conserva el refresh token previo si X no manda uno nuevo', async () => {
    stubXEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          access_token: 'access-fresco',
          token_type: 'bearer',
          scope: X_SCOPES,
          expires_in: 7200,
          // sin refresh_token: X no siempre lo rota
        }),
      })),
    )
    const { sql, calls } = makeSql((text) =>
      text.includes('FROM x_tokens')
        ? [storedRow({ expires_at: new Date(Date.now() + 30_000).toISOString() })]
        : [],
    )

    await expect(getValidAccessToken(sql, 'user-1')).resolves.toBe('access-fresco')

    const update = calls.find((c) => /UPDATE x_tokens/i.test(c.text))
    expect(update, 'el token refrescado debe persistirse').toBeDefined()
    expect(update!.text).toMatch(/WHERE user_id =/i)
    expect(update!.values).toContain('refresh-guardado')
  })

  it('propaga el fallo cuando X rechaza el refresh token', async () => {
    stubXEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        text: async () => 'invalid_request',
      })),
    )
    const { sql } = makeSql((text) =>
      text.includes('FROM x_tokens')
        ? [storedRow({ expires_at: new Date(Date.now() - 1000).toISOString() })]
        : [],
    )

    // Propagar es lo correcto para el sync programado: `x-scheduled-sync`
    // envuelve cada usuario en try/catch, registra el mensaje concreto y sigue
    // con los demás. Tragarse el error y devolver null perdería el motivo.
    //
    // (En el camino interactivo, `x-sync.mts` no distingue este throw de un
    // fallo cualquiera y acaba en un 500 genérico en vez de un "reconecta tu
    // cuenta". Queda anotado en el plan como mejora aparte: distinguirlo bien
    // pide mirar el status de X — un 400 es reconectar, un 503 es reintentar.)
    await expect(getValidAccessToken(sql, 'user-1')).rejects.toThrow(/400/)
  })
})
