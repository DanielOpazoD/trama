import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('chat-threads boundary', () => {
  it('tipa respuestas SQL con sqlTyped en vez de casts locales', () => {
    const src = readFileSync(join(functionsRoot, 'chat-threads.mts'), 'utf8')

    expect(src).toContain('sqlTyped<ChatThreadRow>')
    expect(src).toContain('sqlTyped<CreatedChatThreadRow>')
    expect(src).not.toContain(') as Row[]')
    expect(src).not.toContain(') as Array<{')
  })
})
