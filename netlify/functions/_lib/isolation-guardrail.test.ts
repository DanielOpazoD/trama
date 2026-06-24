import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { PRIVATE_TABLE_CONTRACTS } from '../../../scripts/auth-rls-contracts.mjs'

/**
 * Guardrail de aislamiento multi-usuario.
 *
 * Recorre cada handler `.mts` con SQL inline. Si toca una tabla per-usuario
 * (FROM/INTO/UPDATE/JOIN), el archivo DEBE mencionar `user_id` — proxy de "está
 * filtrando por usuario". Atrapa en CI el bug más peligroso de multi-user: un
 * `WHERE user_id` olvidado, que en producción dejaría a un usuario ver datos de
 * otro. Lo que CI no puede inferir (crons globales legítimos, ownership por
 * path, OAuth) va en EXEMPT con su razón — explícito, no silencioso.
 *
 * Nota: es un check a nivel de archivo (no por query). Los handlers son la
 * superficie principal; helpers con SQL de contexto o X también tienen checks
 * explícitos abajo para que el aislamiento no dependa de memoria tribal.
 */

const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIB_DIR = dirname(fileURLToPath(import.meta.url))
const LIB_X_DIR = join(LIB_DIR, 'x')
const MIGRATIONS_DIR = join(LIB_DIR, '..', '..', 'database', 'migrations')
const REPO_ROOT = join(LIB_DIR, '..', '..', '..')
const SRC_DIR = join(REPO_ROOT, 'src')
const SCRIPTS_DIR = join(REPO_ROOT, 'scripts')

// Tablas con columna user_id (scope por usuario). entity_types y
// relationship_types NO están: son taxonomía GLOBAL compartida por diseño.
const PER_USER_TABLES = PRIVATE_TABLE_CONTRACTS.map(
  (contract: { table: string }) => contract.table,
)

// Exenciones legítimas documentadas. No se permiten gaps conocidos acá: si
// toca tabla per-user, debe mencionar user_id o explicar por qué es global.
const EXEMPT: Record<string, string> = {
  'relationship-types.mts':
    'taxonomía GLOBAL por diseño: chequea uso del tipo en relationships sin scope per-user (conservador: no borra un tipo que cualquier usuario use)',
}

// Superficie HTTP sin getAuthedUser permitida. Debe ser pequeña y explícita:
// callbacks OAuth que validan cookies/state o crons invocados por Netlify.
const PUBLIC_AUTH_EXEMPT: Record<string, string> = {
  'cost-alert-check.mts': 'scheduled function Netlify; no expone datos al cliente',
  'spotify-callback.mts':
    'callback OAuth; valida cookie/state del flujo iniciado autenticado',
  'spotify-scheduled-sync.mts': 'scheduled function Netlify; itera tokens por user_id',
  'x-callback.mts': 'callback OAuth; valida cookie/state del flujo iniciado autenticado',
  'x-scheduled-sync.mts': 'scheduled function Netlify; itera tokens por user_id',
  'whatsapp-webhook.mts':
    'webhook entrante firmado por Twilio (X-Twilio-Signature); resuelve el usuario por el número del remitente (whatsapp_links) y escribe bajo su RLS',
}

const MUTATION_RETURNING_EXEMPT: Record<
  string,
  Array<{ pattern: RegExp; reason: string }>
> = {
  'momentos.mts': [
    {
      pattern:
        /UPDATE\s+momento_entities\s+SET\s+deleted_at\s*=\s*NOW\(\)[\s\S]*?WHERE\s+momento_id\s*=\s*\$\{momentoId\}[\s\S]*?user_id\s*=\s*\$\{ownerUserId\}/i,
      reason:
        'PATCH entity_ids reemplaza el set completo: limpiar 0 links previos es un resultado válido, no un recurso objetivo inexistente.',
    },
  ],
}

function tableRegex(table: string): RegExp {
  return new RegExp(`\\b(?:from|into|update|join)\\s+${table}\\b`, 'i')
}

function scopedJoinClauses(src: string, table: string, alias: string): string[] {
  const clauses: string[] = []
  const joinRe = new RegExp(`\\b(?:left\\s+)?join\\s+${table}\\s+${alias}\\s+on\\b`, 'gi')
  let match: RegExpExecArray | null
  while ((match = joinRe.exec(src))) {
    const rest = src.slice(match.index)
    const stop = rest
      .slice(1)
      .search(/\n\s*(?:left\s+join|join|where|order\s+by|group\s+by|limit|returning)\b/i)
    clauses.push(stop === -1 ? rest : rest.slice(0, stop + 1))
  }
  return clauses
}

function allMigrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .sort()
    .map((dir) => readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'))
    .join('\n')
    .replace(/--.*$/gm, ' ')
}

function productionCodeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) return productionCodeFiles(file)
    if (!/\.(ts|tsx|mts|mjs|js)$/.test(file)) return []
    if (/\.test\.(ts|tsx|mts|mjs|js)$/.test(file)) return []
    return [file]
  })
}

function uncommentedSource(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

// Subdirectorios de _lib en los que un endpoint descompone su SQL/lógica
// (p.ej. `./momentos/handlers.js`, `./whatsapp/foo.js`). Devuelve el fuente de
// TODOS los .ts no-test de esos submódulos, para que el guardrail siga la
// descomposición y no quede ciego al SQL que dejó de estar en el archivo raíz.
function submoduleSources(endpointPath: string, endpointSource: string): string[] {
  const subdirs = new Set<string>()
  const importRe = /from\s+['"]\.\/([a-z0-9-]+)\/[^'"]+\.js['"]/gi
  let match: RegExpExecArray | null
  while ((match = importRe.exec(endpointSource))) subdirs.add(match[1])

  const out: string[] = []
  for (const subdir of subdirs) {
    const dir = join(dirname(endpointPath), subdir)
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue
      out.push(readFileSync(join(dir, entry), 'utf8'))
    }
  }
  return out
}

function sourceForFunction(file: string): string {
  const wrapperPath = join(FUNCTIONS_DIR, file)
  const wrapperSource = readFileSync(wrapperPath, 'utf8')
  const endpointImport = wrapperSource.match(
    /import\s+\w+(?:\s*,\s*\{\s*config\s*\})?\s+from\s+['"]\.\/_lib\/([^'"]+)\.js['"]/,
  )
  if (!endpointImport?.[1]) return wrapperSource
  const endpointPath = join(LIB_DIR, `${endpointImport[1]}.ts`)
  const endpointSource = readFileSync(endpointPath, 'utf8')
  return [endpointSource, ...submoduleSources(endpointPath, endpointSource)].join('\n')
}

function uncommentedFunctionSource(file: string): string {
  return sourceForFunction(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

function repoPath(file: string): string {
  return relative(REPO_ROOT, file)
}

function sqlTemplateBodies(src: string): string[] {
  const bodies: string[] = []
  const re = /sql(?:Typed<[^>]+>)?\s*(?:\([^`]*?)?`([\s\S]*?)`/g
  let match: RegExpExecArray | null
  while ((match = re.exec(src))) bodies.push(match[1])
  return bodies
}

function functionHandlerFiles(): string[] {
  return readdirSync(FUNCTIONS_DIR)
    .filter((file) => file.endsWith('.mts'))
    .sort()
}

function migrationUserTables(sql: string): {
  tables: string[]
  createBodies: Map<string, string[]>
} {
  const tables = new Set<string>()
  const createBodies = new Map<string, string[]>()
  const createTableRe =
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z_]+)\s*\(([\s\S]*?)\);/gi
  let createMatch: RegExpExecArray | null
  while ((createMatch = createTableRe.exec(sql))) {
    const [, table, body] = createMatch
    if (!/\buser_id\b/i.test(body)) continue
    tables.add(table)
    createBodies.set(table, [...(createBodies.get(table) ?? []), body])
  }

  const alterAddUserIdRe =
    /ALTER\s+TABLE\s+([a-z_]+)\s+[^;]*\bADD\s+COLUMN\s+user_id\b[^;]*;/gi
  let alterMatch: RegExpExecArray | null
  while ((alterMatch = alterAddUserIdRe.exec(sql))) {
    tables.add(alterMatch[1])
  }

  return { tables: [...tables].sort(), createBodies }
}

function hasUserForeignKey(
  sql: string,
  createBodies: Map<string, string[]>,
  table: string,
): boolean {
  const createFk = (createBodies.get(table) ?? []).some(
    (body) =>
      /\buser_id\b[\s\S]*?REFERENCES\s+users\s*\(\s*id\s*\)/i.test(body) ||
      /FOREIGN\s+KEY\s*\(\s*user_id\s*\)\s+REFERENCES\s+users\s*\(\s*id\s*\)/i.test(body),
  )
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const alterColumnFk = new RegExp(
    `ALTER\\s+TABLE\\s+${escapedTable}\\s+[^;]*\\bADD\\s+COLUMN\\s+user_id\\b[^;]*REFERENCES\\s+users\\s*\\(\\s*id\\s*\\)[^;]*;`,
    'i',
  ).test(sql)
  const alterConstraintFk = new RegExp(
    `ALTER\\s+TABLE\\s+${escapedTable}\\s+[^;]*FOREIGN\\s+KEY\\s*\\(\\s*user_id\\s*\\)\\s+REFERENCES\\s+users\\s*\\(\\s*id\\s*\\)`,
    'i',
  ).test(sql)

  return createFk || alterColumnFk || alterConstraintFk
}

describe('guardrail: aislamiento por user_id en handlers', () => {
  const files = functionHandlerFiles()

  for (const file of files) {
    const src = sourceForFunction(file)
    const hasAuth = /getAuthedUser/.test(src)

    it(`${file}: endpoint sin getAuthedUser requiere exención explícita`, () => {
      if (hasAuth) {
        expect(hasAuth).toBe(true)
        return
      }
      expect(
        PUBLIC_AUTH_EXEMPT[file],
        `${file} no llama getAuthedUser(). Si es callback/cron legítimo, documentalo en PUBLIC_AUTH_EXEMPT; si no, agregá auth.`,
      ).toBeTruthy()
    })
  }

  for (const file of files) {
    const src = sourceForFunction(file)
    const touchesUserTable = PER_USER_TABLES.some((t) => tableRegex(t).test(src))
    if (!touchesUserTable) continue

    it(`${file}: SQL per-user filtra por user_id`, () => {
      if (file in EXEMPT) {
        // Exención documentada: el test pasa pero deja registro explícito.
        expect(EXEMPT[file]).toBeTruthy()
        return
      }
      expect(
        /user_id/.test(src),
        `${file} ejecuta SQL sobre una tabla per-usuario pero no menciona user_id. ` +
          `Agregá "AND user_id = \${userId}" o documentá la exención en EXEMPT.`,
      ).toBe(true)
    })
  }

  for (const file of files) {
    const src = sourceForFunction(file)
    const writesUserScopedRow = /insert\s+into[\s\S]*\buser_id\b/i.test(src)
    if (!writesUserScopedRow) continue

    it(`${file}: writes con user_id hacen lazy provisioning`, () => {
      expect(
        /ensureUserRow/.test(src),
        `${file} inserta filas con user_id pero no llama ensureUserRow(). ` +
          'Un primer login real podría fallar contra la FK users(id).',
      ).toBe(true)
    })
  }
})

describe('guardrail: architecture fitness suite mínima', () => {
  const files = functionHandlerFiles()

  it('todos los handlers HTTP están envueltos en withObservability', () => {
    const offenders = files.filter((file) => {
      const src = uncommentedFunctionSource(file)
      return (
        !/import\s+\{\s*withObservability\s*\}\s+from\s+['"](?:\.\/(?:_lib\/)?|\.\.\/)handler-wrap\.js['"]/i.test(
          src,
        ) || !/export\s+default\s+withObservability\s*\(/i.test(src)
      )
    })

    expect(
      offenders,
      `Handlers sin contrato operacional explícito: ${offenders.join(', ')}`,
    ).toEqual([])
  })
})

describe('guardrail: migraciones mantienen FK user_id -> users(id)', () => {
  const sql = allMigrationSql()
  const { tables, createBodies } = migrationUserTables(sql)

  it('detecta tablas versionadas con columna user_id', () => {
    expect(tables).toContain('entities')
    expect(tables).toContain('momentos')
    expect(tables).toContain('notes')
    expect(tables).toContain('x_bookmarks')
  })

  it('toda tabla versionada con user_id está clasificada por el guardrail privado', () => {
    const missing = tables.filter((table) => !PER_USER_TABLES.includes(table))
    expect(missing).toEqual([])
  })

  for (const table of tables) {
    it(`${table}: user_id referencia users(id)`, () => {
      expect(
        hasUserForeignKey(sql, createBodies, table),
        `${table} tiene user_id en migraciones pero no declara FK a users(id). ` +
          'Agregá una migración nueva con FOREIGN KEY (user_id) REFERENCES users(id).',
      ).toBe(true)
    })
  }

  it('valida explícitamente las constraints agregadas como NOT VALID', () => {
    const notValid = sql
      .split(';')
      .filter((statement) => /\bNOT\s+VALID\b/i.test(statement))
      .map((statement) => statement.match(/\bCONSTRAINT\s+([a-z0-9_]+)/i)?.[1])
      .filter((constraint): constraint is string => Boolean(constraint))
    const validated = new Set(
      [...sql.matchAll(/\bVALIDATE\s+CONSTRAINT\s+([a-z0-9_]+)/gi)].map(
        (match) => match[1],
      ),
    )

    expect(notValid.length).toBeGreaterThan(0)
    for (const constraint of notValid) {
      expect(
        validated.has(constraint),
        `${constraint} fue creada NOT VALID pero no aparece en una migración posterior con VALIDATE CONSTRAINT.`,
      ).toBe(true)
    }
  })
})

describe('guardrail: migraciones habilitan RLS en tablas privadas', () => {
  const sql = allMigrationSql()

  it('declara políticas RLS basadas en app.current_user_id', () => {
    expect(sql).toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    expect(sql).toMatch(/FORCE\s+ROW\s+LEVEL\s+SECURITY/i)
    expect(sql).toMatch(/CREATE\s+POLICY\s+trama_user_isolation/i)
    expect(sql).toMatch(/current_setting\('app\.current_user_id',\s*true\)/i)
    expect(sql).toMatch(/current_setting\('app\.rls_bypass',\s*true\)\s*=\s*'system'/i)
  })

  for (const table of PER_USER_TABLES) {
    it(`${table}: está cubierta por RLS privado`, () => {
      const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const coveredBySharedPolicy = new RegExp(`'${escapedTable}'`).test(sql)
      const coveredByExplicitPolicy =
        new RegExp(
          `ALTER\\s+TABLE\\s+${escapedTable}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
          'i',
        ).test(sql) &&
        new RegExp(
          `ALTER\\s+TABLE\\s+${escapedTable}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`,
          'i',
        ).test(sql) &&
        new RegExp(
          `CREATE\\s+POLICY[\\s\\S]*?ON\\s+${escapedTable}[\\s\\S]*?current_setting\\('app\\.current_user_id',\\s*true\\)`,
          'i',
        ).test(sql)
      expect(
        coveredBySharedPolicy || coveredByExplicitPolicy,
        `${table} tiene user_id pero no está cubierta por RLS privado. ` +
          'Inclúyela en el array trama_user_isolation o agrega ENABLE/FORCE RLS + política con app.current_user_id.',
      ).toBe(true)
    })
  }
})

describe('guardrail: soft-delete/restore privado verifica filas afectadas', () => {
  it('no deja UPDATE ... deleted_at ... user_id sin RETURNING salvo exención documentada', () => {
    const offenders = readdirSync(FUNCTIONS_DIR)
      .filter((f) => f.endsWith('.mts'))
      .flatMap((file) => {
        const src = sourceForFunction(file)
        return sqlTemplateBodies(src)
          .filter(
            (statement) =>
              /\bUPDATE\s+[a-z_]+\s+SET[\s\S]*?\bdeleted_at\b[\s\S]*?\bWHERE\b[\s\S]*?\buser_id\b/i.test(
                statement,
              ) &&
              !/\bRETURNING\b/i.test(statement) &&
              !(MUTATION_RETURNING_EXEMPT[file] ?? []).some((exemption) =>
                exemption.pattern.test(statement),
              ),
          )
          .map((statement) => ({
            file,
            statement: statement.trim().replace(/\s+/g, ' '),
          }))
      })

    expect(
      offenders,
      'Las mutaciones privadas deben probar ownership por filas afectadas y devolver ApiErrors.notFound si no tocaron filas.',
    ).toEqual([])
  })

  it('mantiene explícitas las exenciones de UPDATE ... deleted_at sin RETURNING', () => {
    for (const [file, exemptions] of Object.entries(MUTATION_RETURNING_EXEMPT)) {
      const src = sourceForFunction(file)
      for (const exemption of exemptions) {
        expect(exemption.reason.length).toBeGreaterThan(20)
        expect(src).toMatch(exemption.pattern)
      }
    }
  })
})

describe('guardrail: endpoints públicos declaran contexto RLS explícito', () => {
  const contextByFile: Record<string, RegExp> = {
    'cost-alert-check.mts': /runWithSystemRls/,
    'spotify-callback.mts': /setCurrentRlsUser/,
    'spotify-scheduled-sync.mts': /runWithSystemRls/,
    'x-callback.mts': /setCurrentRlsUser/,
    'x-scheduled-sync.mts': /runWithSystemRls/,
    'whatsapp-webhook.mts': /setCurrentRlsUser/,
  }

  for (const [file, expected] of Object.entries(contextByFile)) {
    it(`${file}: usa contexto RLS compatible con su exención de auth`, () => {
      const src = sourceForFunction(file)
      expect(
        src,
        `${file} está exento de getAuthedUser(), pero con FORCE RLS debe declarar setCurrentRlsUser() o runWithSystemRls().`,
      ).toMatch(expected)
    })
  }
})

describe('guardrail: JOINs a tablas per-user scopean también el alias unido', () => {
  const expectations = [
    { file: 'search.mts', table: 'entities', alias: 'e', min: 2 },
    { file: 'search.mts', table: 'chat_threads', alias: 't', min: 1 },
    { file: 'cronologia.mts', table: 'entities', alias: 'e', min: 1 },
    { file: 'quote-echoes.mts', table: 'entities', alias: 'e', min: 1 },
    { file: 'quote-reflect.mts', table: 'entities', alias: 'e', min: 2 },
    { file: 'suggest-relationships.mts', table: 'entities', alias: 'ef', min: 1 },
    { file: 'suggest-relationships.mts', table: 'entities', alias: 'et', min: 1 },
    { file: 'proactive-suggestions.mts', table: 'entities', alias: 'ef', min: 1 },
    { file: 'proactive-suggestions.mts', table: 'entities', alias: 'et', min: 1 },
    { file: 'reindex-embeddings.mts', table: 'entities', alias: 'e', min: 1 },
  ]

  for (const { file, table, alias, min } of expectations) {
    it(`${file}: JOIN ${table} ${alias} filtra ${alias}.user_id y ${alias}.deleted_at`, () => {
      const src = sourceForFunction(file)
      const clauses = scopedJoinClauses(src, table, alias)
      expect(clauses.length).toBeGreaterThanOrEqual(min)
      for (const clause of clauses) {
        expect(clause).toMatch(new RegExp(`\\b${alias}\\.user_id\\s*=`))
        expect(clause).toMatch(new RegExp(`\\b${alias}\\.deleted_at\\s+IS\\s+NULL`, 'i'))
      }
    })
  }
})

describe('guardrail: helpers _lib con SQL de contexto también scopean JOINs', () => {
  const expectations = [
    { file: 'rag-context.ts', table: 'entities', alias: 'e', min: 2 },
    { file: 'rag-context.ts', table: 'entities', alias: 'ef', min: 1 },
    { file: 'rag-context.ts', table: 'entities', alias: 'et', min: 1 },
    { file: 'chat-context.ts', table: 'entities', alias: 'e', min: 1 },
    { file: 'chat-context.ts', table: 'entities', alias: 'ef', min: 1 },
    { file: 'chat-context.ts', table: 'entities', alias: 'et', min: 1 },
  ]

  for (const { file, table, alias, min } of expectations) {
    it(`${file}: JOIN ${table} ${alias} filtra ${alias}.user_id y ${alias}.deleted_at`, () => {
      const src = readFileSync(join(LIB_DIR, file), 'utf8')
      const clauses = scopedJoinClauses(src, table, alias)
      expect(clauses.length).toBeGreaterThanOrEqual(min)
      for (const clause of clauses) {
        expect(clause).toMatch(new RegExp(`\\b${alias}\\.user_id\\s*=`))
        expect(clause).toMatch(new RegExp(`\\b${alias}\\.deleted_at\\s+IS\\s+NULL`, 'i'))
      }
    })
  }
})

describe('guardrail: helpers _lib/x con SQL per-user filtran por user_id', () => {
  const files = readdirSync(LIB_X_DIR).filter((f) => f.endsWith('.ts'))

  for (const file of files) {
    const src = readFileSync(join(LIB_X_DIR, file), 'utf8')
    const touchesUserTable = PER_USER_TABLES.some((t) => tableRegex(t).test(src))
    if (!touchesUserTable) continue

    it(`${file}: SQL per-user filtra por user_id`, () => {
      expect(
        /user_id/.test(src),
        `${file} ejecuta SQL sobre una tabla per-usuario desde _lib/x pero no menciona user_id.`,
      ).toBe(true)
    })
  }
})

describe('guardrail: callbacks OAuth públicos preservan identidad de usuario', () => {
  const files = ['spotify-callback.mts', 'x-callback.mts']

  for (const file of files) {
    it(`${file}: rechaza callbacks sin uid y provisiona antes de guardar tokens`, () => {
      const src = readFileSync(join(FUNCTIONS_DIR, file), 'utf8')
      expect(src).toMatch(/missing_uid/)
      expect(src).toMatch(/ensureUserRow/)
      expect(src).toMatch(/saveTokens/)
    })
  }
})

describe('guardrail: endpoints IA no usan fallbacks legacy de ai-mode', () => {
  const files = readdirSync(FUNCTIONS_DIR).filter((f) => f.endsWith('.mts'))

  for (const file of files) {
    const src = readFileSync(join(FUNCTIONS_DIR, file), 'utf8')
    if (!/resolveAIInvocation/.test(src) && !/aiOffResponse/.test(src)) continue

    it(`${file}: resolveAIInvocation recibe userId y aiOffResponse recibe requestId`, () => {
      if (/resolveAIInvocation/.test(src)) {
        expect(
          /resolveAIInvocation\([\s\S]*?\buserId\b[\s\S]*?\)/.test(src),
          `${file} llama resolveAIInvocation sin userId; eso caería al fallback legacy.`,
        ).toBe(true)
      }
      expect(
        /aiOffResponse\(\s*\)/.test(src),
        `${file} llama aiOffResponse sin requestId; eso perdería trazabilidad canónica.`,
      ).toBe(false)
    })
  }
})

describe('guardrail: observabilidad pública no contamina legacy en modo auth estricto', () => {
  const files = ['error-log.mts', 'web-vitals.mts']

  for (const file of files) {
    it(`${file}: no hardcodea userId legacy antes de autenticar`, () => {
      const src = readFileSync(join(FUNCTIONS_DIR, file), 'utf8')
      expect(src).not.toMatch(/let\s+userId\s*=\s*['"]legacy-single-user['"]/)
      expect(src).toMatch(/UnauthenticatedError/)
    })
  }
})

describe('guardrail: backfills de embeddings no escriben filas borradas ni ajenas', () => {
  const expectations = [
    { file: 'entities.mts', table: 'entities' },
    { file: 'quotes.mts', table: 'quotes' },
    { file: 'momentos.mts', table: 'momentos' },
    { file: 'momentos-orphaned-blobs.mts', table: 'momentos' },
    { file: 'reindex-embeddings.mts', table: 'entities' },
    { file: 'reindex-embeddings.mts', table: 'quotes' },
  ]

  for (const { file, table } of expectations) {
    it(`${file}: UPDATE ${table} embedding filtra user_id y deleted_at`, () => {
      const src = sourceForFunction(file)
      const re = new RegExp(
        `update\\s+${table}\\s+set[\\s\\S]*?embedding[\\s\\S]*?where[\\s\\S]*?deleted_at\\s+is\\s+null[\\s\\S]*?user_id\\s*=`,
        'i',
      )
      expect(src).toMatch(re)
    })
  }
})

describe('guardrail: convenciones arquitectónicas absolutas', () => {
  const productionFiles = [
    ...productionCodeFiles(FUNCTIONS_DIR),
    ...productionCodeFiles(SRC_DIR),
    ...productionCodeFiles(SCRIPTS_DIR),
  ]

  it('origin se trata como objeto JSONB, no como string legacy', () => {
    const offenders = productionFiles
      .filter((file) => {
        const src = uncommentedSource(file)
        return (
          /(?:\b\w+\.origin\b|\borigin\b)\s*(?:={2,3}|!={1,2})\s*['"](?:ai|manual|imported)['"]/.test(
            src,
          ) ||
          /['"](?:ai|manual|imported)['"]\s*(?:={2,3}|!={1,2})\s*(?:\b\w+\.origin\b|\borigin\b)/.test(
            src,
          )
        )
      })
      .map(repoPath)

    expect(offenders).toEqual([])
  })

  it('acceso a DB queda detrás de getSql() y no del cliente Neon directo', () => {
    const dbHelper = join(LIB_DIR, 'db.ts')
    const offenders = productionFiles
      .filter((file) => file !== dbHelper)
      .filter((file) => {
        const src = uncommentedSource(file)
        return (
          /NETLIFY_DATABASE_URL/.test(src) ||
          /@neondatabase\/serverless/.test(src) ||
          /\bneon\s*\(/.test(src) ||
          /from\s+['"]@netlify\/database['"]/.test(src)
        )
      })
      .map(repoPath)

    expect(offenders).toEqual([])
  })

  it('el cliente no importa @netlify/blobs', () => {
    const offenders = productionCodeFiles(SRC_DIR)
      .filter((file) => /@netlify\/blobs/.test(uncommentedSource(file)))
      .map(repoPath)

    expect(offenders).toEqual([])
  })
})
