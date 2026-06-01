/**
 * Lee el resultado del callback OAuth (X / Spotify) que vuelve como query param
 * en la URL de retorno: `?x=connected`, `?x_error=state_mismatch`,
 * `?spotify=connected`, `?spotify_error=...`.
 *
 * El front no leía estos params, así que un fallo del OAuth era INVISIBLE — el
 * callback redirige a `/` y el usuario "vuelve al mismo lugar" sin saber qué
 * pasó. Esto los expone para que Settings abra el panel correcto y muestre el
 * resultado (incluyendo el código de error, clave para diagnosticar).
 */

export type OAuthProvider = 'x' | 'spotify'
export type OAuthReturn = { provider: OAuthProvider; ok: boolean; code: string | null }

const PROVIDERS: ReadonlyArray<{
  provider: OAuthProvider
  okKey: string
  errKey: string
}> = [
  { provider: 'x', okKey: 'x', errKey: 'x_error' },
  { provider: 'spotify', okKey: 'spotify', errKey: 'spotify_error' },
]

/** Resultado OAuth presente en la URL actual, o null si no hay ninguno. */
export function readOAuthReturn(): OAuthReturn | null {
  if (typeof window === 'undefined') return null
  let params: URLSearchParams
  try {
    params = new URLSearchParams(window.location.search)
  } catch {
    return null
  }
  for (const p of PROVIDERS) {
    if (params.get(p.okKey) === 'connected') {
      return { provider: p.provider, ok: true, code: null }
    }
    const err = params.get(p.errKey)
    if (err) return { provider: p.provider, ok: false, code: err }
  }
  return null
}

/** Quita los params OAuth de la URL sin recargar (deja la barra limpia). */
export function clearOAuthReturn(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  for (const p of PROVIDERS) {
    url.searchParams.delete(p.okKey)
    url.searchParams.delete(p.errKey)
  }
  window.history.replaceState({}, '', url.toString())
}

/** Mensaje legible para el usuario a partir de un resultado OAuth. */
export function describeOAuthReturn(r: OAuthReturn): { ok: boolean; text: string } {
  const name = r.provider === 'x' ? 'X' : 'Spotify'
  if (r.ok) return { ok: true, text: `Conectado con ${name}.` }
  const hint = OAUTH_ERROR_HINTS[r.code ?? ''] ?? null
  const base = `No se pudo conectar con ${name} (${r.code ?? 'error desconocido'}).`
  return { ok: false, text: hint ? `${base} ${hint}` : base }
}

// Pistas para los códigos de error que devuelve el callback. El código crudo
// siempre se muestra igual (sirve para reportar), la pista solo orienta.
const OAUTH_ERROR_HINTS: Record<string, string> = {
  access_denied: 'Cancelaste la autorización.',
  state_mismatch:
    'No se pudo verificar la sesión. Reinténtalo; si persiste, revisa que el navegador acepte cookies.',
  missing_verifier: 'Se perdió la sesión de autorización. Reinténtalo desde cero.',
  missing_code: 'El proveedor no devolvió el código de autorización.',
}
