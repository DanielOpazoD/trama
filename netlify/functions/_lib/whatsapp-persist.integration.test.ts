import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { SqlClient } from './db'
import { persistCapture } from './whatsapp/persist'
import { persistImageRecorte } from './whatsapp/persist-media'

/**
 * Test de INTEGRACIÓN del camino de escritura de WhatsApp contra Postgres REAL
 * (no mocks). Los tests del webhook mockean SQL, así que nunca ven: aislamiento
 * RLS entre usuarios, la lógica del CTE atómico de citas (find-or-create del
 * autor), los casts `::jsonb/::vector`, los constraints reales y que la
 * procedencia (`source` / `origin.importedFrom`) realmente se persista.
 *
 * Las funciones de persistencia reciben el cliente `sql` por parámetro, así que
 * inyectamos un adapter tagged-template respaldado por `pg`. Cada query corre en
 * su propia transacción con `SET LOCAL ROLE` a un rol NO-superusuario (para que
 * RLS se aplique de verdad) + `set_config('app.current_user_id', …)`, igual que
 * `scopeSqlToRlsContext` en producción.
 *
 * Sólo corre si `WHATSAPP_IT_DB_URL` apunta a una DB migrada (job `migrations`
 * de CI / `npm run db:up` local). Sin esa env var se saltea — el job `unit`
 * normal no tiene base y no debe fallar.
 */

const DB_URL = process.env.WHATSAPP_IT_DB_URL
const APP_ROLE = 'trama_it_app'
const USER_A = 'it-user-a'
const USER_B = 'it-user-b'

function templateToParam(strings: TemplateStringsArray, values: unknown[]): string {
  let text = ''
  strings.forEach((s, i) => {
    text += s
    if (i < values.length) text += `$${i + 1}`
  })
  return text
}

describe.skipIf(!DB_URL)('whatsapp persist (integración Postgres real)', () => {
  let pool: pg.Pool

  /** Query como superusuario (bypassa RLS) — para setup y asserts. */
  async function admin<T = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<T[]> {
    const res = await pool.query(text, values)
    return res.rows as T[]
  }

  /** Cliente `sql` con RLS del usuario `userId` (rol no-superusuario + GUC). */
  function sqlFor(userId: string): SqlClient {
    const run = (strings: TemplateStringsArray, ...values: unknown[]) =>
      (async () => {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          await client.query(`SET LOCAL ROLE ${APP_ROLE}`)
          await client.query("SELECT set_config('app.current_user_id', $1, true)", [
            userId,
          ])
          const res = await client.query(templateToParam(strings, values), values)
          await client.query('COMMIT')
          return res.rows
        } catch (err) {
          await client.query('ROLLBACK')
          throw err
        } finally {
          client.release()
        }
      })()
    return run as unknown as SqlClient
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DB_URL })
    // Rol de app no-superusuario para que las políticas RLS se evalúen.
    await admin(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
        CREATE ROLE ${APP_ROLE} NOSUPERUSER NOBYPASSRLS;
      END IF;
    END $$;`)
    await admin(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`)
    await admin(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`,
    )
    await admin(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`)
    // Usuarios de prueba + limpieza idempotente de datos previos.
    for (const u of [USER_A, USER_B]) {
      await admin(`INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [u])
    }
    for (const t of ['quotes', 'entities', 'notes', 'recortes', 'momentos']) {
      await admin(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [[USER_A, USER_B]])
    }
  })

  afterAll(async () => {
    if (pool) {
      for (const t of ['quotes', 'entities', 'notes', 'recortes', 'momentos']) {
        await admin(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [[USER_A, USER_B]]).catch(
          () => {},
        )
      }
      await pool.end()
    }
  })

  it('nota: persiste con source=whatsapp y queda aislada por RLS', async () => {
    const r = await persistCapture(sqlFor(USER_A), USER_A, {
      kind: 'note',
      content: 'comprar pan integración',
    })
    expect(r.id).toBeTruthy()

    const [row] = await admin<{ source: string; user_id: string; content: string }>(
      'SELECT source, user_id, content FROM notes WHERE id = $1',
      [r.id],
    )
    expect(row.source).toBe('whatsapp')
    expect(row.user_id).toBe(USER_A)

    // RLS: el dueño la ve, otro usuario NO.
    const asOwner = (await sqlFor(USER_A)`SELECT id FROM notes WHERE id = ${r.id}`) as {
      id: string
    }[]
    const asOther = (await sqlFor(USER_B)`SELECT id FROM notes WHERE id = ${r.id}`) as {
      id: string
    }[]
    expect(asOwner).toHaveLength(1)
    expect(asOther).toHaveLength(0)
  })

  it('cita: el CTE atómico hace find-or-create del autor (no duplica entidad)', async () => {
    const author = 'Borges Integración'
    const first = await persistCapture(sqlFor(USER_A), USER_A, {
      kind: 'quote',
      text: 'El tiempo es la sustancia de que estoy hecho',
      author,
    })
    const second = await persistCapture(sqlFor(USER_A), USER_A, {
      kind: 'quote',
      text: 'Uno no es lo que es por lo que escribe',
      author,
    })
    expect(first.id).toBeTruthy()
    expect(second.id).toBeTruthy()

    const ent = await admin<{ n: string }>(
      `SELECT count(*)::text AS n FROM entities
       WHERE user_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL`,
      [USER_A, author],
    )
    const quo = await admin<{ n: string }>(
      `SELECT count(*)::text AS n FROM quotes q
       JOIN entities e ON e.id = q.entity_id
       WHERE q.user_id = $1 AND lower(e.name) = lower($2) AND q.deleted_at IS NULL`,
      [USER_A, author],
    )
    expect(ent[0].n).toBe('1') // una sola entidad para el autor
    expect(quo[0].n).toBe('2') // dos citas colgando de ella
  })

  it('entidad: persiste con origin.importedFrom=whatsapp', async () => {
    const r = await persistCapture(sqlFor(USER_A), USER_A, {
      kind: 'entity',
      name: 'Entropía Integración',
      entityType: 'concepto',
      description: null,
    })
    const [row] = await admin<{ imported_from: string }>(
      `SELECT origin->>'importedFrom' AS imported_from FROM entities WHERE id = $1`,
      [r.id],
    )
    expect(row.imported_from).toBe('whatsapp')
  })

  it('recorte de imagen: persiste con source=whatsapp y capture_mode=image', async () => {
    const r = await persistImageRecorte(
      sqlFor(USER_A),
      USER_A,
      `${USER_A}/foto.jpg`,
      'una foto',
    )
    const [row] = await admin<{
      source: string
      capture_mode: string
      image_key: string
    }>('SELECT source, capture_mode, image_key FROM recortes WHERE id = $1', [r.id])
    expect(row.source).toBe('whatsapp')
    expect(row.capture_mode).toBe('image')
    expect(row.image_key).toBe(`${USER_A}/foto.jpg`)
  })
})
