import { describe, it, expect, vi, afterEach } from 'vitest'
import { estimateTokens, budgetItems, logContextTruncation } from './token-budget'

describe('estimateTokens', () => {
  it('≈ 4 chars por token', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('a'.repeat(40))).toBe(10)
    expect(estimateTokens('abcde')).toBe(2) // ceil(5/4)
  })
})

describe('budgetItems', () => {
  const items = ['aaaa', 'bbbb', 'cccc', 'dddd'] // 1 token c/u

  it('incluye todo cuando entra en el presupuesto', () => {
    const r = budgetItems(items, (s) => s, 100)
    expect(r.items).toEqual(items)
    expect(r.dropped).toBe(0)
    expect(r.usedTokens).toBe(4)
  })

  it('trunca por tokens y reporta los omitidos', () => {
    const r = budgetItems(items, (s) => s, 2) // entran 2
    expect(r.items).toEqual(['aaaa', 'bbbb'])
    expect(r.dropped).toBe(2)
    expect(r.usedTokens).toBe(2)
  })

  it('siempre incluye al menos uno aunque exceda', () => {
    const r = budgetItems(['a'.repeat(400)], (s) => s, 1) // 100 tokens vs budget 1
    expect(r.items).toHaveLength(1)
    expect(r.dropped).toBe(0)
  })

  it('lista vacía → vacío, 0 dropped', () => {
    const r = budgetItems([], (s) => s as string, 10)
    expect(r.items).toEqual([])
    expect(r.dropped).toBe(0)
  })
})

describe('logContextTruncation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('no loguea si no se omitió nada', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logContextTruncation('ask', { entities: 0, relationships: 0, quotes: 0 }, 6000)
    expect(spy).not.toHaveBeenCalled()
  })

  it('loguea context_truncated cuando hay omisiones', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logContextTruncation('chat', { entities: 3, relationships: 0, quotes: 1 }, 6000)
    expect(spy).toHaveBeenCalledOnce()
    const payload = JSON.parse(spy.mock.calls[0]![0] as string)
    expect(payload.event).toBe('context_truncated')
    expect(payload.source).toBe('chat')
    expect(payload.entitiesDropped).toBe(3)
    expect(payload.quotesDropped).toBe(1)
  })
})
