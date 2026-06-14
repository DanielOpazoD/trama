import { describe, expect, it, vi } from 'vitest'
import {
  buildCatalogText,
  buildNlPrompt,
  fallbackQuery,
  translateNl,
  validateNlQuery,
  type NlContext,
} from './nl'

const CTX: NlContext = {
  today: '2026-06-14',
  entityTypes: ['persona', 'filosofo', 'libro'],
}

describe('buildCatalogText', () => {
  it('describe los kinds y capacidades desde el registry', () => {
    const text = buildCatalogText()
    expect(text).toContain('entity:')
    expect(text).toContain('note:')
    expect(text).toContain('prop:<clave>')
    expect(text).toContain('matches')
    expect(text).toContain('linked_to')
  })
})

describe('buildNlPrompt', () => {
  it('incluye fecha de hoy, tipos de entidad, esquema y la pregunta', () => {
    const msgs = buildNlPrompt('filósofos antes de 1900', CTX)
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('2026-06-14')
    expect(msgs[0].content).toContain('filosofo')
    expect(msgs[0].content).toContain('"from"')
    expect(msgs[1]).toEqual({ role: 'user', content: 'filósofos antes de 1900' })
  })
})

describe('validateNlQuery', () => {
  it('acepta un AST válido', () => {
    const r = validateNlQuery({
      from: ['entity'],
      where: { field: 'year', op: 'lt', value: 1900 },
    })
    expect(r.ok).toBe(true)
  })
  it('rechaza un AST inválido y resume el error', () => {
    const r = validateNlQuery({ from: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0)
  })
  it('rechaza basura', () => {
    expect(validateNlQuery('no soy json estructurado').ok).toBe(false)
    expect(validateNlQuery(null).ok).toBe(false)
  })
  it('rechaza un AST válido para Zod pero no compilable (op inválido para el campo)', () => {
    // `type` es un campo de texto (no admite `lt`): pasa Zod pero el
    // compilador lo rechaza → no debe llegar a runQuery.
    const r = validateNlQuery({
      from: ['entity'],
      where: { field: 'type', op: 'lt', value: 'x' },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0)
  })
})

describe('fallbackQuery', () => {
  it('busca texto libre sobre todos los tipos', () => {
    const q = fallbackQuery('estoicismo')
    expect(q.from).toEqual(['entity', 'quote', 'momento', 'note'])
    expect(q.where).toEqual({ op: 'matches', value: 'estoicismo' })
  })
})

describe('translateNl', () => {
  it('AST válido del LLM → source llm', async () => {
    const ask = vi.fn().mockResolvedValue({
      content: { from: ['entity'], where: { field: 'type', op: 'eq', value: 'persona' } },
    })
    const r = await translateNl('personas', CTX, ask)
    expect(r.source).toBe('llm')
    expect(r.query.from).toEqual(['entity'])
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('AST inválido y luego válido → repara (segundo intento)', async () => {
    const ask = vi
      .fn()
      .mockResolvedValueOnce({ content: { from: [] } }) // inválido
      .mockResolvedValueOnce({
        content: { from: ['note'], where: { op: 'matches', value: 'x' } },
      })
    const r = await translateNl('algo', CTX, ask)
    expect(r.source).toBe('llm')
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('dos intentos inválidos → fallback de texto libre', async () => {
    const ask = vi.fn().mockResolvedValue({ content: { nope: true } })
    const r = await translateNl('estoicismo', CTX, ask)
    expect(r.source).toBe('fallback')
    expect(r.query.where).toEqual({ op: 'matches', value: 'estoicismo' })
  })

  it('si el LLM lanza → fallback', async () => {
    const ask = vi.fn().mockRejectedValue(new Error('boom'))
    const r = await translateNl('estoicismo', CTX, ask)
    expect(r.source).toBe('fallback')
  })
})
