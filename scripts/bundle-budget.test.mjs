import { describe, expect, it } from 'vitest'

import { chunkBaseName, classifyBundleEntry } from './bundle-budget.mjs'

describe('bundle budget helpers', () => {
  it('normaliza nombres de chunks con hashes vite que contienen guiones', () => {
    expect(chunkBaseName('MomentosView-D9Z41wa-.js')).toBe('MomentosView')
    expect(chunkBaseName('vendor-react-UUNBh1e2.js')).toBe('vendor-react')
  })

  it('permite chunks chicos sin budget explicito', () => {
    expect(
      classifyBundleEntry({
        base: 'TinyWidget',
        budget: undefined,
        gzKb: 3,
        maxUnbudgetedKb: 10,
      }),
    ).toEqual({ file: 'TinyWidget', gzKb: 3, status: 'no-budget' })
  })

  it('falla chunks grandes sin budget explicito', () => {
    expect(
      classifyBundleEntry({
        base: 'BigRoute',
        budget: undefined,
        gzKb: 13,
        maxUnbudgetedKb: 10,
      }),
    ).toEqual({
      file: 'BigRoute',
      gzKb: 13,
      budget: 10,
      status: 'missing-budget',
    })
  })

  it('falla chunks que exceden su budget explicito', () => {
    expect(
      classifyBundleEntry({
        base: 'GraphView',
        budget: 18,
        gzKb: 19,
        maxUnbudgetedKb: 10,
      }),
    ).toEqual({ file: 'GraphView', gzKb: 19, budget: 18, status: 'over-budget' })
  })
})
