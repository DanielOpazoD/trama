import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import pg from 'pg'
import type { SqlClient } from './sql-client'

const DB_URL = process.env.BACKEND_DATA_IT_DB_URL || process.env.QUERY_IT_DB_URL
const APP_ROLE = 'trama_backend_data_it_app'
const USER_A = 'backend-data-it-user-a'
const USER_B = 'backend-data-it-user-b'

const dbState = vi.hoisted(() => ({
  pool: null as pg.Pool | null,
}))

type QueryDescriptor = {
  strings: TemplateStringsArray
  values: unknown[]
}

function templateToParam(strings: TemplateStringsArray, values: unknown[]): string {
  let text = ''
  strings.forEach((s, i) => {
    text += s
    if (i < values.length) text += `$${i + 1}`
  })
  return text
}

vi.mock('./db.js', async () => {
  const { scopeSqlToRlsContext } =
    await vi.importActual<typeof import('./user-rls.js')>('./user-rls.js')

  async function executeDescriptor(client: pg.PoolClient, query: QueryDescriptor) {
    const result = await client.query(
      templateToParam(query.strings, query.values),
      query.values,
    )
    return result.rows
  }

  function buildSql(): SqlClient {
    const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (!dbState.pool) throw new Error('backend-data-it pool no inicializado')
      const client = await dbState.pool.connect()
      try {
        return await executeDescriptor(client, { strings, values })
      } finally {
        client.release()
      }
    }) as SqlClient

    sql.transaction = async (buildQueries: (tx: SqlClient) => unknown[]) => {
      if (!dbState.pool) throw new Error('backend-data-it pool no inicializado')
      const client = await dbState.pool.connect()
      const tx = ((strings: TemplateStringsArray, ...values: unknown[]) => ({
        strings,
        values,
      })) as unknown as SqlClient

      try {
        await client.query('BEGIN')
        await client.query(`SET LOCAL ROLE ${APP_ROLE}`)
        const queries = buildQueries(tx) as QueryDescriptor[]
        const results = []
        for (const query of queries) {
          results.push(await executeDescriptor(client, query))
        }
        await client.query('COMMIT')
        return results
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    }

    return scopeSqlToRlsContext(sql)
  }

  return {
    getSql: () => buildSql(),
    sqlTyped: <Row>(query: Promise<unknown>) => query as Promise<Row[]>,
  }
})

vi.mock('./auth.js', async () => {
  const { setCurrentRlsUser } =
    await vi.importActual<typeof import('./user-rls.js')>('./user-rls.js')

  return {
    getAuthedUser: async (req: Request) => {
      const id = req.headers.get('x-test-user-id') ?? USER_A
      setCurrentRlsUser(id)
      return { id, email: `${id}@example.test` }
    },
  }
})

import entitiesHandler from '../entities'
import quotesHandler from '../quotes'
import searchHandler from '../search'
import momentosHandler from '../momentos'
import notesHandler from '../notes'
import notasFeedHandler from '../notas-feed'
import { clearRlsContext } from './user-rls.js'

function jsonRequest(
  path: string,
  {
    method = 'GET',
    body,
    userId = USER_A,
  }: { method?: string; body?: unknown; userId?: string } = {},
) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-test-user-id': userId,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

function context(params: Record<string, string> = {}) {
  return { params } as never
}

async function expectJson<T>(response: Response, status: number): Promise<T> {
  expect(response.status).toBe(status)
  return (await response.json()) as T
}

describe.skipIf(!DB_URL)('backend/data executable contracts (Postgres real)', () => {
  let pool: pg.Pool

  async function admin<T = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ) {
    const result = await pool.query(text, values)
    return result.rows as T[]
  }

  async function cleanupUsers() {
    for (const table of ['notas_attachments', 'momento_entities']) {
      await admin(
        `UPDATE ${table} SET deleted_at = NOW() WHERE user_id = ANY($1) AND deleted_at IS NULL`,
        [[USER_A, USER_B]],
      ).catch(() => {})
    }
    for (const table of [
      'notes',
      'recortes',
      'momentos',
      'quotes',
      'relationships',
      'entities',
    ]) {
      await admin(
        `UPDATE ${table} SET deleted_at = NOW() WHERE user_id = ANY($1) AND deleted_at IS NULL`,
        [[USER_A, USER_B]],
      ).catch(() => {})
    }
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DB_URL })
    dbState.pool = pool
    await admin(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
        CREATE ROLE ${APP_ROLE} NOSUPERUSER NOBYPASSRLS;
      END IF;
    END $$;`)
    await admin(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`)
    await admin(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`,
    )
    for (const userId of [USER_A, USER_B]) {
      await admin(
        `INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
        [userId, `${userId}@example.test`],
      )
    }
    await cleanupUsers()
  })

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => '',
        json: async () => ({}),
      }),
    )
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    clearRlsContext()
    await cleanupUsers()
  })

  afterAll(async () => {
    await cleanupUsers().catch(() => {})
    dbState.pool = null
    await pool?.end()
  })

  it('crea entidad, crea cita y encuentra la cita por search lexical', async () => {
    const suffix = 'bdc-search-4242'
    const entity = await expectJson<{ id: string; name: string }>(
      await entitiesHandler(
        jsonRequest('/api/entities', {
          method: 'POST',
          body: {
            type: 'backend-data-persona',
            name: `Borges ${suffix}`,
            description: 'Entidad creada por contrato endpoint DB.',
          },
        }),
        context(),
      ),
      201,
    )

    const quote = await expectJson<{ id: string; text: string }>(
      await quotesHandler(
        jsonRequest('/api/quotes', {
          method: 'POST',
          body: {
            entity_id: entity.id,
            text: `oraculo backend ${suffix}`,
            source: 'backend-data-it',
          },
        }),
        context(),
      ),
      201,
    )

    const search = await expectJson<{ quotes: Array<{ id: string; text: string }> }>(
      await searchHandler(
        jsonRequest(`/api/search?q=${encodeURIComponent(suffix)}&mode=lexical&limit=10`),
        context(),
      ),
      200,
    )
    expect(search.quotes.map((item) => item.id)).toContain(quote.id)

    const [dbQuote] = await admin<{ n: string }>(
      `SELECT COUNT(*)::text AS n
       FROM quotes
       WHERE id = $1 AND entity_id = $2 AND user_id = $3 AND deleted_at IS NULL`,
      [quote.id, entity.id, USER_A],
    )
    expect(dbQuote?.n).toBe('1')
  })

  it('crea un momento con entityIds y lo lista con links reales', async () => {
    const entity = await expectJson<{ id: string }>(
      await entitiesHandler(
        jsonRequest('/api/entities', {
          method: 'POST',
          body: {
            type: 'backend-data-lugar',
            name: 'Entidad para momento backend-data-it',
          },
        }),
        context(),
      ),
      201,
    )

    const momento = await expectJson<{ id: string; entity_ids: string[] }>(
      await momentosHandler(
        jsonRequest('/api/momentos', {
          method: 'POST',
          body: {
            kind: 'nota',
            payload: { bodyText: 'Momento creado por contrato endpoint DB' },
            captured_at: '2026-06-22T12:00:00.000Z',
            entity_ids: [entity.id],
          },
        }),
        context(),
      ),
      201,
    )
    expect(momento.entity_ids).toEqual([entity.id])

    const listed = await expectJson<{
      items: Array<{ id: string; entity_ids: string[] }>
    }>(
      await momentosHandler(jsonRequest('/api/momentos?limit=10&kind=nota'), context()),
      200,
    )
    expect(listed.items.find((item) => item.id === momento.id)?.entity_ids).toContain(
      entity.id,
    )

    const [dbLink] = await admin<{ n: string }>(
      `SELECT COUNT(*)::text AS n
       FROM momento_entities
       WHERE momento_id = $1 AND entity_id = $2 AND user_id = $3 AND deleted_at IS NULL`,
      [momento.id, entity.id, USER_A],
    )
    expect(dbLink?.n).toBe('1')
  })

  it('crea notas, pagina notas-feed por cursor y respeta soft-delete/scope', async () => {
    const noteA = await expectJson<{ id: string }>(
      await notesHandler(
        jsonRequest('/api/notes', {
          method: 'POST',
          body: { content: 'nota backend-data visible #contrato', title: 'Visible' },
        }),
        context(),
      ),
      201,
    )
    const noteB = await expectJson<{ id: string }>(
      await notesHandler(
        jsonRequest('/api/notes', {
          method: 'POST',
          body: { content: 'nota backend-data segunda #contrato', title: 'Segunda' },
        }),
        context(),
      ),
      201,
    )
    await expectJson<{ id: string }>(
      await notesHandler(
        jsonRequest('/api/notes', {
          method: 'POST',
          userId: USER_B,
          body: { content: 'nota backend-data ajena #contrato', title: 'Ajena' },
        }),
        context(),
      ),
      201,
    )

    const firstPage = await expectJson<{
      items: Array<{ id: string; type: string; note?: { content: string } }>
      nextCursor: string | null
    }>(
      await notasFeedHandler(
        jsonRequest('/api/notas-feed?segment=escritas&tag=contrato&limit=1'),
        context(),
      ),
      200,
    )
    expect(firstPage.items).toHaveLength(1)
    expect(firstPage.items[0]?.id).not.toBeUndefined()
    expect(firstPage.nextCursor).toBeTruthy()

    const secondPage = await expectJson<{
      items: Array<{ id: string; type: string; note?: { content: string } }>
    }>(
      await notasFeedHandler(
        jsonRequest(
          `/api/notas-feed?segment=escritas&tag=contrato&limit=10&cursor=${encodeURIComponent(
            firstPage.nextCursor ?? '',
          )}`,
        ),
        context(),
      ),
      200,
    )
    const userANoteIds = new Set([noteA.id, noteB.id])
    expect(secondPage.items.every((item) => userANoteIds.has(item.id))).toBe(true)
    expect(secondPage.items.map((item) => item.id)).not.toContain(firstPage.items[0]?.id)

    const deleted = await expectJson<{ deletedAt: string }>(
      await notesHandler(
        jsonRequest(`/api/notes/${noteA.id}`, { method: 'DELETE' }),
        context({ id: noteA.id }),
      ),
      200,
    )
    expect(deleted.deletedAt).toBeTruthy()

    const afterDelete = await expectJson<{ items: Array<{ id: string }> }>(
      await notasFeedHandler(
        jsonRequest('/api/notas-feed?segment=escritas&tag=contrato&limit=10'),
        context(),
      ),
      200,
    )
    expect(afterDelete.items.map((item) => item.id)).not.toContain(noteA.id)
  })
})
