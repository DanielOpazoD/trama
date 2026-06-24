import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockSqlResponses, setupMockSql } from '../test-utils'

vi.mock('../db.js', () => setupMockSql())
vi.mock('../cost-cap.js', () => ({ checkMonthlyBudget: vi.fn() }))
vi.mock('../ai-mode.js', () => ({ resolveAIInvocation: vi.fn() }))

import { getSql } from '../db.js'
import { checkMonthlyBudget } from '../cost-cap.js'
import { resolveAIInvocation } from '../ai-mode.js'
import { extractPhotoIntent, transcribeAudioIntent } from './media-pipeline.js'

beforeEach(() => {
  mockSqlResponses.reset()
  vi.mocked(checkMonthlyBudget).mockReset()
  vi.mocked(resolveAIInvocation).mockReset()
})

const buffer = new ArrayBuffer(8)

describe('extractPhotoIntent (degrada a Recorte sin gastar IA)', () => {
  it('over-budget → null, sin resolver la invocación', async () => {
    vi.mocked(checkMonthlyBudget).mockResolvedValue(new Response(null, { status: 429 }))
    const intent = await extractPhotoIntent(
      new Request('http://x'),
      'u1',
      'r1',
      buffer,
      'image/jpeg',
      'quote',
      '',
    )
    expect(intent).toBeNull()
    expect(resolveAIInvocation).not.toHaveBeenCalled()
  })

  it('IA off → null', async () => {
    vi.mocked(checkMonthlyBudget).mockResolvedValue(null)
    vi.mocked(resolveAIInvocation).mockResolvedValue({ kind: 'off' })
    const intent = await extractPhotoIntent(
      new Request('http://x'),
      'u1',
      'r1',
      buffer,
      'image/jpeg',
      'text',
      '',
    )
    expect(intent).toBeNull()
  })
})

describe('transcribeAudioIntent (degrada cuando no hay presupuesto)', () => {
  it('over-budget → null', async () => {
    vi.mocked(checkMonthlyBudget).mockResolvedValue(new Response(null, { status: 429 }))
    const intent = await transcribeAudioIntent('u1', 'r1', getSql(), buffer, 'audio/ogg')
    expect(intent).toBeNull()
  })
})
