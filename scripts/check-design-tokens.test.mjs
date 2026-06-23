import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkDesignTokens, collectDesignTokenUsage } from './check-design-tokens.mjs'

// Crea un repo mínimo con un único componente .tsx bajo src/ y devuelve
// tanto el root como un helper para reescribir ese archivo.
async function makeRepo(initialSource = '') {
  const root = await mkdtemp(join(tmpdir(), 'trama-design-tokens-'))
  mkdirSync(join(root, 'src/components'), { recursive: true })
  const file = join(root, 'src/components/Sample.tsx')
  writeFileSync(file, initialSource)
  return { root, file }
}

describe('checkDesignTokens', () => {
  it('cuenta arbitrary tipográfico y aliases legacy, e ignora colores arbitrary', async () => {
    const { root } = await makeRepo(
      [
        'export const a = <p className="text-[14px]" />',
        'export const b = <p className="tracking-[0.18em]" />',
        // text-[color:...] es color arbitrary, NO cuenta.
        'export const c = <p className="text-[color:var(--accent-clay)]" />',
        'export const d = <p className="text-sm" />',
        'export const e = <p className="text-2xl" />',
        // tokens semánticos: no cuentan.
        'export const f = <p className="text-body text-caption" />',
      ].join('\n'),
    )

    const { totals } = collectDesignTokenUsage(root)

    expect(totals.arbitrary).toBe(2)
    expect(totals.legacy).toBe(2)
  })

  it('excluye archivos de test del conteo', async () => {
    const { root } = await makeRepo('export const a = <p className="text-sm" />')
    writeFileSync(
      join(root, 'src/components/Sample.test.tsx'),
      'export const t = <p className="text-sm text-[14px]" />',
    )

    const { totals } = collectDesignTokenUsage(root)

    expect(totals.arbitrary).toBe(0)
    expect(totals.legacy).toBe(1)
  })

  it('pasa cuando el conteo respeta el baseline', async () => {
    const { root } = await makeRepo(
      'export const a = <p className="text-sm text-[14px]" />',
    )

    const result = checkDesignTokens({ root, baseline: { arbitrary: 1, legacy: 1 } })

    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
  })

  it('falla cuando un conteo sube por encima del baseline', async () => {
    const { root } = await makeRepo(
      [
        'export const a = <p className="text-sm" />',
        'export const b = <p className="text-xs" />',
      ].join('\n'),
    )

    const result = checkDesignTokens({ root, baseline: { arbitrary: 0, legacy: 1 } })

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual([{ kind: 'legacy', actual: 2, baseline: 1 }])
    expect(result.perFile[0].file).toBe('src/components/Sample.tsx')
  })

  it('avisa (sin fallar) cuando el conteo baja respecto al baseline', async () => {
    const { root } = await makeRepo('export const a = <p className="text-body" />')

    const result = checkDesignTokens({ root, baseline: { arbitrary: 0, legacy: 2 } })

    expect(result.ok).toBe(true)
    expect(result.notices).toEqual([{ kind: 'legacy', actual: 0, baseline: 2 }])
  })
})
