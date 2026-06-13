import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('search scale benchmark script', () => {
  it('expone un comando npm para medir búsqueda a 10k/50k sin tocar datos de usuario', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    const scriptPath = join(process.cwd(), 'scripts/search-scale-benchmark.mjs')

    expect(pkg.scripts['bench:search-scale']).toBe(
      'node scripts/search-scale-benchmark.mjs',
    )
    expect(pkg.scripts['bench:search-scale:portable']).toBe(
      'SEARCH_BENCHMARK_SCHEMA=portable node scripts/search-scale-benchmark.mjs',
    )
    expect(existsSync(scriptPath)).toBe(true)

    const source = readFileSync(scriptPath, 'utf8')
    expect(source).toContain('SEARCH_BENCHMARK_SIZES')
    expect(source).toContain('trama-benchmark-search')
    expect(source).toContain('EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)')
    expect(source).toContain('SEARCH_BENCHMARK_KEEP_FIXTURES')
  })

  it('ofrece un modo portable que crea schema temporal lexical sin DB migrada', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts/search-scale-benchmark.mjs'),
      'utf8',
    )

    expect(source).toContain('SEARCH_BENCHMARK_SCHEMA')
    expect(source).toContain('portable')
    expect(source).toContain('CREATE TEMP TABLE entities')
    expect(source).toContain('CREATE TEMP TABLE quotes')
    expect(source).toContain('search_vector tsvector GENERATED ALWAYS AS')
    expect(source).toContain('idx_benchmark_entities_search')
    expect(source).toContain('idx_benchmark_quotes_search')
  })

  it('no hard-deletea tablas con deleted_at al limpiar fixtures', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts/search-scale-benchmark.mjs'),
      'utf8',
    )

    expect(source).not.toMatch(/\bDELETE\s+FROM\s+quotes\b/i)
    expect(source).not.toMatch(/\bDELETE\s+FROM\s+entities\b/i)
  })
})
