import { createHash, randomBytes } from 'node:crypto'
import { getSql, sqlTyped } from './db.js'
import { runWithSystemRls } from './user-rls.js'

/**
 * Tokens personales (PAT) para la extensión de Chrome. El token viaja como
 * `Authorization: Bearer trama_pat_<random>`; en DB vive SOLO su sha256.
 * El prefijo distingue un PAT de un JWT de Clerk sin intentar verificarlo
 * como tal.
 */

export const PAT_PREFIX = 'trama_pat_'

export function isPersonalToken(token: string): boolean {
  return token.startsWith(PAT_PREFIX)
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Genera el par (token en claro, hash). El claro se muestra UNA vez. */
export function generateToken(): { token: string; hash: string } {
  const token = `${PAT_PREFIX}${randomBytes(24).toString('base64url')}`
  return { token, hash: hashToken(token) }
}

/**
 * Resuelve el dueño de un PAT vigente, o null. Corre con bypass de RLS
 * (todavía no hay usuario en el contexto: ESTE lookup lo establece).
 * Marca last_used_at best-effort.
 */
export async function resolvePersonalToken(token: string): Promise<string | null> {
  const hash = hashToken(token)
  const sql = getSql()
  return runWithSystemRls(async () => {
    const rows = await sqlTyped<{ user_id: string }>(sql`
      UPDATE api_tokens
      SET last_used_at = NOW()
      WHERE token_hash = ${hash} AND revoked_at IS NULL
      RETURNING user_id
    `)
    return rows[0]?.user_id ?? null
  })
}
