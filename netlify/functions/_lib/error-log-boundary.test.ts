import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sanitizeObservedPath } from './observed-path'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('error-log boundary', () => {
  it('tipa lectura SQL del historico con sqlTyped', () => {
    const src = readFileSync(join(functionsRoot, 'error-log.mts'), 'utf8')

    expect(src).toContain('sqlTyped<Row>')
    expect(src).not.toContain(') as Row[]')
  })

  it('sanitiza paths de observabilidad antes de persistirlos', () => {
    const src = readFileSync(join(functionsRoot, 'error-log.mts'), 'utf8')

    expect(src).toContain('sanitizeObservedPath(body.path)')
    expect(src).not.toContain('body.path ? body.path.slice(0, 500) : null')
    expect(
      sanitizeObservedPath('/entities/550e8400-e29b-41d4-a716-446655440000?token=secret'),
    ).toBe('/entities/:id')
    expect(sanitizeObservedPath('/imports/202606010001')).toBe('/imports/:n')
  })
})
