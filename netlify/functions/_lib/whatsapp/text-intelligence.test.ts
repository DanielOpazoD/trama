import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockSqlResponses, setupMockSql } from '../test-utils'

vi.mock('../db.js', () => setupMockSql())
vi.mock('../cost-cap.js', () => ({ checkMonthlyBudget: vi.fn() }))
vi.mock('../ai-mode.js', () => ({ resolveAIInvocation: vi.fn() }))

import { getSql } from '../db.js'
import { checkMonthlyBudget } from '../cost-cap.js'
import { resolveAIInvocation } from '../ai-mode.js'
import { buildStatusReply, classifyFreeform } from './text-intelligence.js'

beforeEach(() => {
  mockSqlResponses.reset()
  vi.mocked(checkMonthlyBudget).mockReset()
  vi.mocked(resolveAIInvocation).mockReset()
})

describe('buildStatusReply', () => {
  it('consulta el vínculo + el conteo mensual y devuelve un resumen no vacío', async () => {
    mockSqlResponses.push([
      {
        verified_at: '2026-01-01',
        label: 'iPhone',
        last_capture_kind: 'note',
        last_capture_at: '2026-06-01',
      },
    ])
    mockSqlResponses.push([{ n: 7 }])
    const out = await buildStatusReply(getSql(), 'u1', '+1')
    expect(typeof out).toBe('string')
    expect(out.length).toBeGreaterThan(0)
    expect(mockSqlResponses.calls[0].template).toContain('whatsapp_links')
    expect(mockSqlResponses.calls[1].template).toContain('whatsapp_processed_messages')
  })
})

describe('classifyFreeform (degradación sin gastar LLM)', () => {
  it('over-budget → nota plana, sin resolver la IA', async () => {
    vi.mocked(checkMonthlyBudget).mockResolvedValue(new Response(null, { status: 429 }))
    const intent = await classifyFreeform(
      new Request('http://x'),
      'u1',
      'hola mundo',
      'r1',
    )
    expect(intent).toEqual({ kind: 'note', content: 'hola mundo' })
    expect(resolveAIInvocation).not.toHaveBeenCalled()
  })

  it('IA off → nota plana', async () => {
    vi.mocked(checkMonthlyBudget).mockResolvedValue(null)
    vi.mocked(resolveAIInvocation).mockResolvedValue({ kind: 'off' })
    const intent = await classifyFreeform(new Request('http://x'), 'u1', 'hola', 'r1')
    expect(intent).toEqual({ kind: 'note', content: 'hola' })
  })
})
