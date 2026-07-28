import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from '../env'
import {
  exchangeCodeForTokens,
  getStoredTokens,
  getValidAccessToken,
  needsReconnect,
  saveTokens,
} from './auth'

/**
 * Tokens de Spotify: lo que pasa entre "el usuario conectó" y "el sync de cada
 * tres horas sigue funcionando dentro de seis meses".
 *
 * Estos caminos no se ejercitaban (2.17% y 30.43% de cobertura en las dos
 * `auth.ts` de OAuth) y son justo donde un fallo es silencioso: nadie ve un
 * error, simplemente el sync deja de traer nada y la app sigue diciendo
 * "conectado".
 *
 * Nota sobre el upsert: la semántica real de `ON CONFLICT` sólo se puede
 * comprobar contra Postgres, y aquí no hay base. Lo que sí se puede comprobar
 * —y es donde estaba el bug— es que la sentencia preserve el token guardado en
 * vez de pisarlo. Por eso esa aserción mira el SQL emitido y no una fila.
 */

type SqlTag = Parameters<typeof getStoredTokens>[0]

type Capture = { text: string; values: unknown[] }

/** `sql` de mentira: registra cada sentencia y responde según el texto. */
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
    id: 'default',
    spotify_user_id: 'sp-1',
    display_name: 'Daniel',
    access_token: 'access-guardado',
    refresh_token: 'refresh-guardado',
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    scopes: 'user-read-recently-played',
    connected_at: new Date().toISOString(),
    last_synced_at: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * `getEnv()` cachea el resultado la primera vez que se llama, así que un
 * `stubEnv` posterior no lo alcanza. Hay que invalidar la caché al poner y al
 * quitar los stubs.
 */
function stubSpotifyEnv(secret = 'secreto-que-no-debe-salir') {
  vi.stubEnv('SPOTIFY_CLIENT_ID', 'client-id')
  vi.stubEnv('SPOTIFY_CLIENT_SECRET', secret)
  vi.stubEnv('SPOTIFY_REDIRECT_URI', 'https://trama.test/cb')
  resetEnvCache()
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetEnvCache()
})

describe('saveTokens', () => {
  /**
   * La regresión que motivó este pack.
   *
   * `spotify-callback.mts` persiste `tokens.refresh_token ?? ''` porque la
   * columna es `TEXT NOT NULL`, y Spotify declara `refresh_token` opcional en
   * su respuesta. Si el upsert escribía ese valor tal cual, una simple
   * re-autorización —algo que el propio código pide hacer cuando cambian los
   * scopes— borraba el refresh token bueno. A partir de ahí el sync fallaba
   * para siempre y en silencio: la app seguía mostrando "conectado".
   *
   * El hermano de X ya lo hacía bien (`COALESCE(EXCLUDED.refresh_token, ...)`);
   * Spotify era el caso desviado.
   */
  it('no pisa el refresh token guardado cuando el nuevo llega vacío', async () => {
    const { sql, calls } = makeSql()

    await saveTokens(
      sql,
      {
        spotifyUserId: 'sp-1',
        displayName: 'Daniel',
        accessToken: 'access-nuevo',
        refreshToken: '', // Spotify no devolvió refresh_token en la re-auth
        expiresAt: new Date(),
        scopes: null,
      },
      'user-1',
    )

    const upsert = calls[0]!.text
    expect(upsert).toMatch(/ON CONFLICT \(user_id\) DO UPDATE/i)
    // La sentencia tiene que conservar lo que ya había cuando llega vacío.
    expect(upsert.replace(/\s+/g, ' ')).toMatch(
      /refresh_token\s*=\s*COALESCE\(\s*NULLIF\(EXCLUDED\.refresh_token,\s*''\)\s*,\s*spotify_tokens\.refresh_token\s*\)/i,
    )
  })

  it('asocia el row al usuario que se le pasa', async () => {
    const { sql, calls } = makeSql()
    await saveTokens(
      sql,
      {
        spotifyUserId: null,
        displayName: null,
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date(),
        scopes: null,
      },
      'user-42',
    )
    expect(calls[0]!.values).toContain('user-42')
  })
})

describe('getStoredTokens', () => {
  it('filtra por user_id y devuelve null si no hay fila', async () => {
    const { sql, calls } = makeSql(() => [])
    const result = await getStoredTokens(sql, 'user-1')
    expect(result).toBeNull()
    expect(calls[0]!.text).toMatch(/WHERE user_id =/i)
    expect(calls[0]!.values).toEqual(['user-1'])
  })
})

describe('getValidAccessToken', () => {
  it('devuelve null cuando el usuario no tiene tokens', async () => {
    const { sql } = makeSql(() => [])
    await expect(getValidAccessToken(sql, 'user-1')).resolves.toBeNull()
  })

  it('reusa el token guardado si le queda más de un minuto', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { sql } = makeSql((text) =>
      text.includes('FROM spotify_tokens') ? [storedRow()] : [],
    )

    await expect(getValidAccessToken(sql, 'user-1')).resolves.toBe('access-guardado')
    // Lo importante no es el valor: es que NO se llamó a Spotify.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  /**
   * Gemelo del test de X: sin refresh token no hay nada que renovar, así que
   * hay que devolver null y NO salir a la red. Spotify no lo cortaba y hacía
   * una llamada condenada al proveedor en cada sync.
   */
  it('devuelve null si venció y el refresh token está vacío, sin llamar a Spotify', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { sql } = makeSql((text) =>
      text.includes('FROM spotify_tokens')
        ? [
            storedRow({
              expires_at: new Date(Date.now() - 1000).toISOString(),
              refresh_token: '',
            }),
          ]
        : [],
    )
    await expect(getValidAccessToken(sql, 'user-1')).resolves.toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  /**
   * El margen de 60s existe para que un token que vence "ahora mismo" no se
   * use en una request que tarda medio segundo en salir. Probar justo dentro
   * del margen es lo que evita que alguien lo baje a 0 sin darse cuenta.
   */
  it('refresca cuando el token vence dentro del margen de 60s', async () => {
    stubSpotifyEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          access_token: 'access-fresco',
          token_type: 'Bearer',
          scope: 'user-read-recently-played',
          expires_in: 3600,
        }),
      })),
    )
    const { sql, calls } = makeSql((text) =>
      text.includes('FROM spotify_tokens')
        ? [storedRow({ expires_at: new Date(Date.now() + 30_000).toISOString() })]
        : [],
    )

    await expect(getValidAccessToken(sql, 'user-1')).resolves.toBe('access-fresco')

    const update = calls.find((c) => /UPDATE spotify_tokens/i.test(c.text))
    expect(update, 'el token refrescado debe persistirse').toBeDefined()
    expect(update!.text).toMatch(/WHERE user_id =/i)
    // Spotify no siempre devuelve refresh_token al refrescar: hay que
    // conservar el que ya teníamos o el siguiente refresh es imposible.
    expect(update!.values).toContain('refresh-guardado')
  })

  it('al refrescar ignora un refresh token vacío y conserva el previo', async () => {
    stubSpotifyEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          access_token: 'access-fresco',
          token_type: 'Bearer',
          scope: 'user-read-recently-played',
          expires_in: 3600,
          refresh_token: '', // el schema lo permite; `??` no lo filtraría
        }),
      })),
    )
    const { sql, calls } = makeSql((text) =>
      text.includes('FROM spotify_tokens')
        ? [storedRow({ expires_at: new Date(Date.now() + 30_000).toISOString() })]
        : [],
    )

    await expect(getValidAccessToken(sql, 'user-1')).resolves.toBe('access-fresco')

    const update = calls.find((c) => /UPDATE spotify_tokens/i.test(c.text))!
    expect(update.values).toContain('refresh-guardado')
    expect(update.values).not.toContain('')
  })
})

describe('exchangeCodeForTokens', () => {
  it('falla con el status cuando Spotify rechaza el código', async () => {
    stubSpotifyEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        text: async () => 'invalid_grant',
      })),
    )

    await expect(exchangeCodeForTokens('codigo-malo')).rejects.toThrow(/400/)
  })

  it('no filtra el client secret en el mensaje de error', async () => {
    stubSpotifyEnv('secreto-que-no-debe-salir')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => 'invalid_client',
      })),
    )

    // El mensaje viaja a logs y a veces a la UI; el secreto no puede ir dentro.
    const error = await exchangeCodeForTokens('c').then(
      () => null,
      (e: unknown) => e as Error,
    )
    expect(error, 'la llamada debía fallar').not.toBeNull()
    expect(error!.message).not.toContain('secreto-que-no-debe-salir')
  })
})

describe('needsReconnect', () => {
  /**
   * El estado de conexión se calcula sin salir a la red: si hiciera falta
   * preguntarle al proveedor, cada carga de Ajustes costaría un round-trip.
   */
  it('es false mientras el token siga vivo', () => {
    expect(needsReconnect(storedRow())).toBe(false)
  })

  it('es false si venció pero queda refresh token: se recupera solo', () => {
    const row = storedRow({
      expires_at: new Date(Date.now() - 1000).toISOString(),
      refresh_token: 'refresh-guardado',
    })
    expect(needsReconnect(row)).toBe(false)
  })

  /**
   * El caso que motivó todo: tras el clobber quedaba cadena vacía, la app
   * seguía diciendo "conectado" y el sync no traía nada. Ahora se distingue.
   */
  it('es true si venció y el refresh token quedó vacío', () => {
    const row = storedRow({
      expires_at: new Date(Date.now() - 1000).toISOString(),
      refresh_token: '',
    })
    expect(needsReconnect(row)).toBe(true)
  })

  it('respeta el margen de 60s: un token que vence dentro del margen ya cuenta', () => {
    const row = storedRow({
      expires_at: new Date(Date.now() + 30_000).toISOString(),
      refresh_token: '',
    })
    expect(needsReconnect(row)).toBe(true)
  })
})
