import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

function sqlBlocks(file: string): string[] {
  const src = readFileSync(join(FUNCTIONS_DIR, file), 'utf8')
  return Array.from(src.matchAll(/sql`([\s\S]*?)`/g), (match) => match[1] ?? '')
}

function expectBlocksMatching(
  file: string,
  label: string,
  predicate: (block: string) => boolean,
  assertion: (block: string) => void,
) {
  const blocks = sqlBlocks(file).filter(predicate)
  expect(
    blocks.length,
    `${file}: no se encontraron bloques SQL para ${label}`,
  ).toBeGreaterThan(0)
  for (const block of blocks) assertion(block)
}

describe('guardrail: chat y ask aíslan threads/messages por user_id', () => {
  it('chat-messages.mts scopa toda lectura/escritura de chat_messages y chat_threads', () => {
    expectBlocksMatching(
      'chat-messages.mts',
      'SELECT/UPDATE chat_threads',
      (block) => /\b(?:FROM|UPDATE)\s+chat_threads\b/i.test(block),
      (block) => expect(block).toMatch(/user_id/i),
    )
    expectBlocksMatching(
      'chat-messages.mts',
      'SELECT chat_messages',
      (block) => /\bFROM\s+chat_messages\b/i.test(block),
      (block) => expect(block).toMatch(/user_id/i),
    )
    expectBlocksMatching(
      'chat-messages.mts',
      'INSERT chat_messages',
      (block) => /\bINSERT\s+INTO\s+chat_messages\b/i.test(block),
      (block) => expect(block).toMatch(/\buser_id\b/i),
    )
  })

  it('ask.mts scopa history, selected entity y persistencia de chat por user_id', () => {
    expectBlocksMatching(
      'ask.mts',
      'SELECT chat_messages',
      (block) => /\bFROM\s+chat_messages\b/i.test(block),
      (block) => expect(block).toMatch(/user_id/i),
    )
    expectBlocksMatching(
      'ask.mts',
      'INSERT chat_threads',
      (block) => /\bINSERT\s+INTO\s+chat_threads\b/i.test(block),
      (block) => expect(block).toMatch(/\buser_id\b/i),
    )
    expectBlocksMatching(
      'ask.mts',
      'INSERT chat_messages',
      (block) => /\bINSERT\s+INTO\s+chat_messages\b/i.test(block),
      (block) => expect(block).toMatch(/\buser_id\b/i),
    )
    expectBlocksMatching(
      'ask.mts',
      'UPDATE chat_threads',
      (block) => /\bUPDATE\s+chat_threads\b/i.test(block),
      (block) => expect(block).toMatch(/user_id/i),
    )
    expectBlocksMatching(
      'ask.mts',
      'selected entity',
      (block) => /\bFROM\s+entities\b/i.test(block),
      (block) => expect(block).toMatch(/user_id/i),
    )
  })
})
