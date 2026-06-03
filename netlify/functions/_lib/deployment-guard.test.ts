import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const script = join(repoRoot, 'scripts/check-legacy-fallback-prod.mjs')

function run(extraEnv: Record<string, string>) {
  return spawnSync(process.execPath, [script], {
    env: {
      PATH: process.env.PATH ?? '',
      ...extraEnv,
    },
    encoding: 'utf8',
  })
}

describe('deployment guard', () => {
  it('passes with no Clerk configured outside production cutover', () => {
    const res = run({})

    expect(res.status).toBe(0)
    expect(res.stdout).toContain('multi-user deployment guard ok')
  })

  it('fails when only backend Clerk is configured', () => {
    const res = run({ CLERK_SECRET_KEY: 'sk_test_x' })

    expect(res.status).toBe(1)
    expect(res.stderr).toContain('Configuración Clerk incompleta')
  })

  it('fails when only frontend Clerk is configured', () => {
    const res = run({ VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_x' })

    expect(res.status).toBe(1)
    expect(res.stderr).toContain('Configuración Clerk incompleta')
  })

  it('fails when production keeps the legacy fallback enabled', () => {
    const res = run({
      CONTEXT: 'production',
      CLERK_SECRET_KEY: 'sk_live_x',
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_x',
      ALLOW_LEGACY_FALLBACK: 'true',
    })

    expect(res.status).toBe(1)
    expect(res.stderr).toContain('ALLOW_LEGACY_FALLBACK=true')
  })

  it('fails when production has no Clerk credentials', () => {
    const res = run({ CONTEXT: 'production' })

    expect(res.status).toBe(1)
    expect(res.stderr).toContain('Clerk es obligatorio en producción')
  })
})
