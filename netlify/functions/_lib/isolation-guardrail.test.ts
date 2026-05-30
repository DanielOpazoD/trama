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
 * Nota: es un check a nivel de archivo (no por query). Los handlers que delegan
 * el SQL a `_lib/*` helpers pasan `userId` por parámetro y no tienen la tabla
 * inline — esos no los cubre este guardrail (los cubren sus propios tests).
 */

const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

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
  'extraction_log',
  'error_log',
  'ai_task_providers',
  'proactive_suggestions',
  'web_vitals_samples',
  'cronicas',
]

// Exenciones legítimas o gaps conocidos documentados (ver
// docs/migracion-multi-user.md → "checklist de go-live").
const EXEMPT: Record<string, string> = {
  'cost-alert-check.mts':
    'cron de alertas: costo global (gap conocido, pendiente per-user)',
  'spotify-scheduled-sync.mts': 'cron: per-user pendiente (ver runbook)',
  'spotify-callback.mts':
    'OAuth callback: ownership por state (Spotify per-user pendiente)',
  'relationship-types.mts':
    'taxonomía GLOBAL por diseño: chequea uso del tipo en relationships sin scope per-user (conservador: no borra un tipo que cualquier usuario use)',
}

function tableRegex(table: string): RegExp {
  return new RegExp(`\\b(?:from|into|update|join)\\s+${table}\\b`, 'i')
}

describe('guardrail: aislamiento por user_id en handlers', () => {
  const files = readdirSync(FUNCTIONS_DIR).filter((f) => f.endsWith('.mts'))

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
})
