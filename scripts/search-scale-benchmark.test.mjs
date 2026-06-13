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
    expect(existsSync(scriptPath)).toBe(true)

    const source = readFileSync(scriptPath, 'utf8')
    expect(source).toContain('SEARCH_BENCHMARK_SIZES')
    expect(source).toContain('trama-benchmark-search')
    expect(source).toContain('EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)')
    expect(source).toContain('SEARCH_BENCHMARK_KEEP_FIXTURES')
  })
})
