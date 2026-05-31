import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

// Tablas con columna user_id (scope por usuario). entity_types y
// relationship_types NO están: son taxonomía GLOBAL compartida por diseño.
const PER_USER_TABLES = [
  'entities',
  'relationships',
  'quotes',
  'momentos',
  'momento_entities',
  'notes',
  'tasks',
  'chat_threads',
  'chat_messages',
  'spotify_plays',
  'spotify_tokens',
  'x_tokens',
  'x_bookmarks',
  'extraction_log',
  'error_log',
  'ai_task_providers',
  'proactive_suggestions',
  'web_vitals_samples',
  'cronicas',
  'atlas_snapshots',
  'x_cronicas',
]

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

describe('guardrail: aislamiento por user_id en handlers', () => {
  const files = readdirSync(FUNCTIONS_DIR).filter((f) => f.endsWith('.mts'))

  for (const file of files) {
    const src = readFileSync(join(FUNCTIONS_DIR, file), 'utf8')
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
    const src = readFileSync(join(FUNCTIONS_DIR, file), 'utf8')
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
    const src = readFileSync(join(FUNCTIONS_DIR, file), 'utf8')
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
      const src = readFileSync(join(FUNCTIONS_DIR, file), 'utf8')
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
      const src = readFileSync(join(FUNCTIONS_DIR, file), 'utf8')
      const re = new RegExp(
        `update\\s+${table}\\s+set[\\s\\S]*?embedding[\\s\\S]*?where[\\s\\S]*?deleted_at\\s+is\\s+null[\\s\\S]*?user_id\\s*=`,
        'i',
      )
      expect(src).toMatch(re)
    })
  }
})
