import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('chat-messages boundary', () => {
  it('tipa respuestas SQL con sqlTyped en vez de casts locales', () => {
    const src = readFileSync(join(functionsRoot, 'chat-messages.mts'), 'utf8')

    expect(src).toContain('sqlTyped<')
    expect(src).not.toContain(') as Row[]')
    expect(src).not.toContain(
      ') as Array<{ id: string; title: string | null; context: string | null }>',
    )
    expect(src).not.toContain(') as UserInsertRow[]')
    expect(src).not.toContain(') as HistoryRow[]')
    expect(src).not.toContain(') as AssistantInsertRow[]')
  })
})
