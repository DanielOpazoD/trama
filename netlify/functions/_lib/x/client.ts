/**
 * Internals compartidos del paquete X (Twitter): endpoints, tipo del cliente
 * SQL y lector tipado de env. Plomería interna — no se re-exporta del barrel.
 *
 * Env vars (inerte si faltan):
 *   X_CLIENT_ID
 *   X_CLIENT_SECRET
 *   X_REDIRECT_URI   — debe coincidir con lo registrado en la app de X
 */

import type { getSql } from '../db.js'
import { getEnv } from '../env.js'

export type SqlClient = ReturnType<typeof getSql>

export const AUTH_URL = 'https://twitter.com/i/oauth2/authorize'
export const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
export const API_BASE = 'https://api.twitter.com/2'

export function readEnv(
  key: 'X_CLIENT_ID' | 'X_CLIENT_SECRET' | 'X_REDIRECT_URI',
): string {
  const v = getEnv()[key]
  if (!v) throw new Error(`${key} no está configurada en el entorno`)
  return v
}
