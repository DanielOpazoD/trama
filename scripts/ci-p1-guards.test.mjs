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
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    const smoke = readFileSync(join(process.cwd(), 'scripts/smoke-isolation.mjs'), 'utf8')
    const e2eSmoke = readFileSync(
      join(process.cwd(), 'e2e/multi-user-isolation.spec.ts'),
      'utf8',
    )

    expect(pkg.scripts['smoke:multiuser:prod']).toBe('node scripts/smoke-isolation.mjs')
    expect(smoke).toContain('ALLOW_LEGACY_FALLBACK debe estar off')
    expect(smoke).toContain("api(null, 'GET', '/api/entities')")
    expect(smoke).toContain('anon.status === 401')
    expect(smoke).toContain('anonymous_401')
    expect(smoke).toContain('read_isolation')
    expect(smoke).toContain('mutation_isolation')
    expect(smoke).toContain('blob_isolation')
    expect(e2eSmoke).toContain('anonymous requests cannot use the legacy fallback')
    expect(e2eSmoke).toContain('E2E_REVOKED_TOKEN')
    expect(e2eSmoke).toContain('revoked tokens cannot use the API')
    expect(e2eSmoke).toContain('anon.get')
    expect(e2eSmoke).toContain('toBe(401)')
  })

  it('mantiene el runbook como checklist vivo de gates y riesgos críticos', () => {
    const runbook = readFileSync(
      join(process.cwd(), 'docs/runbook-multiusuario.md'),
      'utf8',
    )

    expect(runbook).toContain('Quality gates por dominio crítico')
    for (const domain of ['Auth', 'RLS', 'Soft delete', 'Blobs']) {
      expect(runbook).toMatch(new RegExp(`\\|\\s*${domain}\\s*\\|`))
    }

    expect(runbook).toContain('Registro vivo de riesgos')
    for (const risk of [
      'Fallback legacy activo',
      'Endpoint privado sin auth',
      'Mutación privada 2xx no-op',
      'Blob/anexo accesible por otro usuario',
      'Log con contenido sensible',
    ]) {
      expect(runbook).toContain(risk)
    }
  })
})
