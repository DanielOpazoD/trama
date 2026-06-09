#!/usr/bin/env node

/**
 * Garantiza que cada migración tenga un PREFIJO de timestamp ÚNICO.
 *
 * Las migraciones viven en `netlify/database/migrations/<timestamp14>_<slug>/`
 * y se aplican en orden lexicográfico por ese prefijo numérico. Dos migraciones
 * con el mismo prefijo hacen ambiguo el orden de aplicación y YA rompieron un
 * deploy una vez (el runner de migraciones de Netlify difiere de
 * `scripts/apply-migrations.sh`, que es idempotente pero no valida unicidad).
 *
 * Este check convierte ese fallo de producción conocido en un error de CI
 * barato: corre en milisegundos y no toca la base de datos.
 */

import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATIONS_DIR = resolve(process.cwd(), 'netlify/database/migrations')

// Formato canónico: 14 dígitos (YYYYMMDDhhmmss) + "_" + slug en snake_case.
const NAME_PATTERN = /^(\d{14})_[a-z0-9_]+$/

const entries = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const malformed = []
const namesByPrefix = new Map()

for (const name of entries) {
  const match = NAME_PATTERN.exec(name)
  if (!match) {
    malformed.push(name)
    continue
  }
  const prefix = match[1]
  const list = namesByPrefix.get(prefix) ?? []
  list.push(name)
  namesByPrefix.set(prefix, list)
}

const duplicates = [...namesByPrefix.entries()].filter(([, names]) => names.length > 1)

if (malformed.length > 0 || duplicates.length > 0) {
  if (malformed.length > 0) {
    console.error('Migraciones fuera del formato <timestamp14>_<slug>:')
    for (const name of malformed) console.error(`  - ${name}`)
  }
  if (duplicates.length > 0) {
    console.error('Prefijos de migración DUPLICADOS (rompen el orden de aplicación):')
    for (const [prefix, names] of duplicates) {
      console.error(`  - ${prefix}: ${names.join(', ')}`)
    }
  }
  process.exit(1)
}

console.log(`migraciones ok — ${entries.length} prefijos únicos`)
