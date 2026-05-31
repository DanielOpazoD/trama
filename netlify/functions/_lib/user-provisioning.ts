import type { AuthedUser } from './auth.js'
import type { getSql } from './db.js'

type SqlClient = ReturnType<typeof getSql>

/**
 * Lazy provisioning para el rollout multi-user: si Clerk ya autenticó al
 * usuario, garantizamos que exista su fila antes de escribir filas con FK.
 */
export async function ensureUserRow(sql: SqlClient, user: AuthedUser): Promise<void> {
  await sql`
    INSERT INTO users (id, email)
    VALUES (${user.id}, ${user.email ?? null})
    ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, users.email)
  `
}
