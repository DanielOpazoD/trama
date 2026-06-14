import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { SqlClient } from './db'
import { runQuery } from './query/execute'
import { applyObjectProperties } from './object-properties'
import { translateNl, type NlContext } from './query/nl'

/**
 * Test de INTEGRACIÓN del motor de queries contra Postgres REAL (no mocks).
 * Valida que el SQL compilado es correcto y ejecutable, que el filtrado
 * (rango, tags, texto, cross-tipo) devuelve lo esperado, y que el aislamiento
 * RLS se respeta entre usuarios.
 *
 * Igual que whatsapp-persist.integration.test.ts: inyecta un adapter `sql`
 * tagged-template sobre `pg` que corre cada query con `SET LOCAL ROLE` a un rol
 * no-superusuario + `set_config('app.current_user_id')`, replicando
 * scopeSqlToRlsContext. Sólo corre con `QUERY_IT_DB_URL` (job migrations de CI /
 * `npm run db:up`); sin esa env var se saltea.
 */
const DB_URL = process.env.QUERY_IT_DB_URL
const APP_ROLE = 'trama_query_it_app'
const USER_A = 'query-it-user-a'
const USER_B = 'query-it-user-b'

function templateToParam(strings: TemplateStringsArray, values: unknown[]): string {
  let text = ''
  strings.forEach((s, i) => {
    text += s
    if (i < values.length) text += `$${i + 1}`
  })
  return text
}

describe.skipIf(!DB_URL)('query engine (integración Postgres real)', () => {
  let pool: pg.Pool

  async function admin<T = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<T[]> {
    const res = await pool.query(text, values)
    return res.rows as T[]
  }

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
    await admin(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
        CREATE ROLE ${APP_ROLE} NOSUPERUSER NOBYPASSRLS;
      END IF;
    END $$;`)
    await admin(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`)
    await admin(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`,
    )
    for (const u of [USER_A, USER_B]) {
      await admin(`INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [u])
    }
    // Soft-delete de datos previos (contrato AGENTS.md).
    for (const t of ['notes', 'entities', 'quotes', 'relationships']) {
      await admin(
        `UPDATE ${t} SET deleted_at = NOW() WHERE user_id = ANY($1) AND deleted_at IS NULL`,
        [[USER_A, USER_B]],
      )
    }
    // Datos de prueba.
    await admin(
      `INSERT INTO entities (user_id, type, name, year) VALUES
        ($1,'qit-persona','BorgesQIT Unico',1960),
        ($1,'qit-libro','Tomo Viejo QIT',1800),
        ($2,'qit-persona','Otro de B',1990)`,
      [USER_A, USER_B],
    )
    await admin(`INSERT INTO notes (user_id, content, tags) VALUES ($1,$2,$3)`, [
      USER_A,
      'apuntes de trabajo qit',
      ['qit-work'],
    ])
  })

  afterAll(async () => {
    if (pool) {
      for (const t of ['notes', 'entities', 'quotes', 'relationships']) {
        await admin(
          `UPDATE ${t} SET deleted_at = NOW() WHERE user_id = ANY($1) AND deleted_at IS NULL`,
          [[USER_A, USER_B]],
        ).catch(() => {})
      }
      await pool.end()
    }
  })

  it('rango de fechas/números: year BETWEEN filtra correctamente', async () => {
    const { items } = await runQuery(sqlFor(USER_A), {
      from: ['entity'],
      where: { field: 'year', op: 'between', value: [1900, 2100] },
    })
    const names = items.map((i) => i.title)
    expect(names).toContain('BorgesQIT Unico')
    expect(names).not.toContain('Tomo Viejo QIT')
  })

  it('cross-tipo con OR: entidades libro + notas con tag, en una sola query', async () => {
    const { items } = await runQuery(sqlFor(USER_A), {
      from: ['entity', 'note'],
      where: {
        or: [
          { field: 'type', op: 'eq', value: 'qit-libro' },
          { field: 'tags', op: 'has_any', value: ['qit-work'] },
        ],
      },
    })
    const kinds = new Set(items.map((i) => i.kind))
    expect(kinds.has('entity')).toBe(true)
    expect(kinds.has('note')).toBe(true)
  })

  it('FTS: matches encuentra por search_vector', async () => {
    const { items } = await runQuery(sqlFor(USER_A), {
      from: ['entity'],
      where: { op: 'matches', value: 'BorgesQIT' },
    })
    expect(items.some((i) => i.title === 'BorgesQIT Unico')).toBe(true)
  })

  it('RLS: un usuario no ve las entidades de otro', async () => {
    const { items } = await runQuery(sqlFor(USER_B), {
      from: ['entity'],
      where: { field: 'type', op: 'eq', value: 'qit-persona' },
    })
    const names = items.map((i) => i.title)
    expect(names).toContain('Otro de B')
    expect(names).not.toContain('BorgesQIT Unico') // de USER_A
  })

  async function entityId(name: string): Promise<string> {
    const [row] = await admin<{ id: string }>(
      'SELECT id FROM entities WHERE user_id = $1 AND name = $2 AND deleted_at IS NULL',
      [USER_A, name],
    )
    if (!row) throw new Error(`setup: no se encontró la entidad ${name}`)
    return row.id
  }

  it('propiedades: set vía applyObjectProperties y filtrar por prop:<key>', async () => {
    const id = await entityId('BorgesQIT Unico')
    await applyObjectProperties(sqlFor(USER_A), {
      kind: 'entity',
      id,
      setProps: { team: 'marketing' },
    })
    const { items } = await runQuery(sqlFor(USER_A), {
      from: ['entity'],
      where: { field: 'prop:team', op: 'eq', value: 'marketing' },
    })
    expect(items.map((i) => i.id)).toContain(id)
  })

  it('tags unificados cross-tipo: entidad + nota por tag', async () => {
    const id = await entityId('BorgesQIT Unico')
    await applyObjectProperties(sqlFor(USER_A), {
      kind: 'entity',
      id,
      setTags: ['qit-shared'],
    })
    const { items } = await runQuery(sqlFor(USER_A), {
      from: ['entity', 'note'],
      where: { field: 'tags', op: 'has_any', value: ['qit-shared', 'qit-work'] },
    })
    const kinds = new Set(items.map((i) => i.kind))
    expect(kinds.has('entity')).toBe(true)
    expect(kinds.has('note')).toBe(true)
  })

  it('linked_to: citas (entity_id) y entidades (relationships) vinculadas', async () => {
    const borges = await entityId('BorgesQIT Unico')
    const tomo = await entityId('Tomo Viejo QIT')
    await admin(`INSERT INTO quotes (user_id, entity_id, text) VALUES ($1,$2,$3)`, [
      USER_A,
      borges,
      'cita qit',
    ])
    await admin(
      `INSERT INTO relationships (user_id, from_id, to_id, type) VALUES ($1,$2,$3,$4)`,
      [USER_A, borges, tomo, 'qit-rel'],
    )

    const quotes = await runQuery(sqlFor(USER_A), {
      from: ['quote'],
      where: { op: 'linked_to', id: borges },
    })
    expect(quotes.items.some((i) => i.snippet === 'cita qit')).toBe(true)

    const ents = await runQuery(sqlFor(USER_A), {
      from: ['entity'],
      where: { op: 'linked_to', id: borges },
    })
    expect(ents.items.map((i) => i.title)).toContain('Tomo Viejo QIT')
  })

  it('paginación keyset: cursor avanza sin repetir ni saltear', async () => {
    const where = {
      field: 'type',
      op: 'in' as const,
      value: ['qit-persona', 'qit-libro'],
    }
    const page1 = await runQuery(sqlFor(USER_A), { from: ['entity'], where, limit: 1 })
    expect(page1.items).toHaveLength(1)
    expect(page1.nextCursor).toBeTruthy()

    const page2 = await runQuery(sqlFor(USER_A), {
      from: ['entity'],
      where,
      limit: 1,
      cursor: page1.nextCursor ?? undefined,
    })
    expect(page2.items).toHaveLength(1)
    expect(page2.items[0].id).not.toBe(page1.items[0].id)
  })

  it('NL→AST→SQL→PG: el AST traducido se ejecuta contra Postgres real', async () => {
    const ctx: NlContext = { today: '2026-06-14', entityTypes: ['qit-persona'] }
    // Stub del LLM: devuelve un AST de matches (la parte NL está unit-tested;
    // acá probamos que el AST traducido compila y corre contra PG real).
    const ask = () =>
      Promise.resolve({
        content: { from: ['entity'], where: { op: 'matches', value: 'BorgesQIT' } },
      })
    const { query, source } = await translateNl('algo de borges', ctx, ask)
    expect(source).toBe('llm')
    const { items } = await runQuery(sqlFor(USER_A), query)
    expect(items.some((i) => i.title === 'BorgesQIT Unico')).toBe(true)
  })

  it('saved_queries: aislamiento RLS + soft-delete entre usuarios', async () => {
    const ast = JSON.stringify({ from: ['entity'], where: { op: 'matches', value: 'x' } })
    const inserted = (await sqlFor(USER_A)`
      INSERT INTO saved_queries (user_id, name, query)
      VALUES (${USER_A}, ${'Mi consulta QIT'}, ${ast}::jsonb)
      RETURNING id
    `) as unknown as Array<{ id: string }>
    const id = inserted[0]!.id

    // A la ve; B no (RLS).
    const seenByA = (await sqlFor(USER_A)`
      SELECT id FROM saved_queries WHERE id = ${id} AND deleted_at IS NULL
    `) as unknown as unknown[]
    expect(seenByA).toHaveLength(1)
    const seenByB = (await sqlFor(USER_B)`
      SELECT id FROM saved_queries WHERE id = ${id} AND deleted_at IS NULL
    `) as unknown as unknown[]
    expect(seenByB).toHaveLength(0)

    // Soft-delete por A → deja de verla.
    await sqlFor(USER_A)`UPDATE saved_queries SET deleted_at = NOW() WHERE id = ${id}`
    const afterDelete = (await sqlFor(USER_A)`
      SELECT id FROM saved_queries WHERE id = ${id} AND deleted_at IS NULL
    `) as unknown as unknown[]
    expect(afterDelete).toHaveLength(0)
  })
})
