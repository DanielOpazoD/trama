/**
 * Internals compartidos por los submódulos de Spotify (auth / sync /
 * playlist / snapshot): endpoints base, el tipo del cliente SQL y el
 * lector tipado de env.
 *
 * No se re-exporta desde `index.ts` — es plomería interna del paquete.
 *
 * Env vars requeridas:
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *   SPOTIFY_REDIRECT_URI   — debe coincidir con lo registrado en la app Spotify
 */

import type { getSql } from '../db.js'
import { getEnv } from '../env.js'

export type SqlClient = ReturnType<typeof getSql>

export const TOKEN_URL = 'https://accounts.spotify.com/api/token'
export const AUTH_URL = 'https://accounts.spotify.com/authorize'
export const API_BASE = 'https://api.spotify.com/v1'

/**
 * O1: lee la env por nombre desde el schema tipado de `_lib/env.ts`.
 * Antes era `Netlify.env.get(key)` directo; ahora pasa por getEnv()
 * — el typo de un nombre se detecta en compile-time.
 *
 * Si la var requerida no está, falla con un mensaje claro. El callsite
 * decide si propagar (en flujos OAuth) o degradar (rare acá).
 */
export function readEnv(
  key: 'SPOTIFY_CLIENT_ID' | 'SPOTIFY_CLIENT_SECRET' | 'SPOTIFY_REDIRECT_URI',
): string {
  const v = getEnv()[key]
  if (!v) throw new Error(`${key} no está configurada en el entorno`)
  return v
}
