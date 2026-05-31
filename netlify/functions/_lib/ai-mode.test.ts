import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aiOffResponse } from './ai-mode'

describe('aiOffResponse', () => {
  it('devuelve AI_DISABLED con el shape canónico de ApiErrors', async () => {
    const res = aiOffResponse('rid-ai-off')

    expect(res.status).toBe(423)
    const body = await res.json()
    expect(body).toMatchObject({
      error: {
        code: 'AI_DISABLED',
        message: 'IA deshabilitada por el usuario (modo Off).',
        requestId: 'rid-ai-off',
      },
    })
  })
})

describe('resolveAIInvocation', () => {
  it('no tiene fallback implícito a legacy-single-user', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'ai-mode.ts'),
      'utf8',
    )
    expect(src).not.toMatch(/\buserId\b[^,\n)]*=\s*['"]legacy-single-user['"]/)
  })
})
