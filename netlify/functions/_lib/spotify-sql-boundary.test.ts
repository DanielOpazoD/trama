import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('spotify SQL boundary', () => {
  it('tipa timestamps de reproduccion con sqlTyped en spotify-timing', () => {
    const src = readFileSync(join(functionsRoot, 'spotify-timing.mts'), 'utf8')

    expect(src).toContain('sqlTyped<Row>')
    expect(src).not.toContain(') as Row[]')
  })

  it('tipa resumen de conexion con sqlTyped en spotify-status', () => {
    const src = readFileSync(join(functionsRoot, 'spotify-status.mts'), 'utf8')

    expect(src).toContain('sqlTyped<CountsRow>')
    expect(src).not.toContain(
      ') as Array<{ total_plays: string; unique_tracks: string; most_recent_play: string | null }>',
    )
  })
})
