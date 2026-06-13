import { describe, expect, it } from 'vitest'

import { buildVitestArgs } from './vitest-runner-args.mjs'

describe('vitest runner args', () => {
  it('limita workers por defecto para estabilizar la suite completa', () => {
    expect(buildVitestArgs(['run'])).toEqual(['--maxWorkers=4', 'run'])
  })

  it('respeta un maxWorkers explicito del caller', () => {
    expect(buildVitestArgs(['run', '--maxWorkers=2'])).toEqual(['run', '--maxWorkers=2'])
    expect(buildVitestArgs(['run', '--maxWorkers', '2'])).toEqual([
      'run',
      '--maxWorkers',
      '2',
    ])
  })
})
