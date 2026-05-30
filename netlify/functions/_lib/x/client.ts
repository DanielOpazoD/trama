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

// La autorización (página que ve el usuario) va a x.com: X migró de
// twitter.com → x.com y la sesión del usuario vive en x.com. Si mandamos a
// twitter.com, la página no reconoce la sesión y el authorize falla con
// 400 "Bad Authentication data" (code 215), aunque el usuario esté logueado.
// El intercambio de tokens y la API siguen en api.twitter.com (server-side,
// con credenciales de app — sin dependencia de la sesión del navegador).
export const AUTH_URL = 'https://x.com/i/oauth2/authorize'
export const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
export const API_BASE = 'https://api.twitter.com/2'

export function readEnv(
  key: 'X_CLIENT_ID' | 'X_CLIENT_SECRET' | 'X_REDIRECT_URI',
): string {
  const v = getEnv()[key]
  if (!v) throw new Error(`${key} no está configurada en el entorno`)
  return v
}

/**
 * ¿Está la integración de X configurada? Permite a los endpoints devolver un
 * error claro (en vez de un 500 por `readEnv` lanzando) cuando faltan las
 * claves — la feature es inerte hasta que el operador las ponga en Netlify.
 */
export function isXConfigured(): boolean {
  const env = getEnv()
  return Boolean(env.X_CLIENT_ID && env.X_CLIENT_SECRET && env.X_REDIRECT_URI)
}
