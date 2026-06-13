import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('CI P1 guardrails', () => {
  it('ejecuta el guard de fallback legacy en el workflow principal', () => {
    const workflow = readFileSync(
      join(process.cwd(), '.github/workflows/test.yml'),
      'utf8',
    )

    expect(workflow).toContain('Legacy fallback production guard')
    expect(workflow).toContain('npm run check:legacy-fallback')
  })

  it('mantiene el smoke multiusuario conectado a la verificación sin token', () => {
    const smoke = readFileSync(join(process.cwd(), 'scripts/smoke-isolation.mjs'), 'utf8')
    const e2eSmoke = readFileSync(
      join(process.cwd(), 'e2e/multi-user-isolation.spec.ts'),
      'utf8',
    )

    expect(smoke).toContain('ALLOW_LEGACY_FALLBACK debe estar off')
    expect(smoke).toContain("api(null, 'GET', '/api/entities')")
    expect(smoke).toContain('anon.status === 401')
    expect(e2eSmoke).toContain('anonymous requests cannot use the legacy fallback')
    expect(e2eSmoke).toContain('anon.get')
    expect(e2eSmoke).toContain('toBe(401)')
  })
})
