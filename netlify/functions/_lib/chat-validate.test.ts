import { describe, expect, it } from 'vitest'
import { hasAnyProposal, parseChatReply } from './chat-validate'

describe('parseChatReply', () => {
  it('treats a no-marker reply as prose with no proposal', () => {
    const r = parseChatReply('Camus y Sartre se conocieron en los 40.')
    expect(r.prose).toBe('Camus y Sartre se conocieron en los 40.')
    expect(r.proposal).toBeNull()
  })

  it('extracts a proposal block placed at the end', () => {
    const raw = `Aquí va el contexto.

<<<TRAMA-PROPOSAL
{"entities":[{"type":"persona","name":"X"}]}
TRAMA-PROPOSAL>>>`
    const r = parseChatReply(raw)
    expect(r.prose).toBe('Aquí va el contexto.')
    expect(r.proposal).toEqual({ entities: [{ type: 'persona', name: 'X' }] })
  })

  it('survives malformed JSON inside markers by dropping only the proposal', () => {
    const raw = `Texto válido.

<<<TRAMA-PROPOSAL
{not json
TRAMA-PROPOSAL>>>`
    const r = parseChatReply(raw)
    expect(r.prose).toBe('Texto válido.')
    expect(r.proposal).toBeNull()
  })

  it('handles missing close marker by treating everything as prose', () => {
    const raw = `Algo bonito.

<<<TRAMA-PROPOSAL
{"foo":1}`
    const r = parseChatReply(raw)
    expect(r.prose).toContain('Algo bonito')
    expect(r.proposal).toBeNull()
  })

  it('trims surrounding whitespace from the prose', () => {
    const r = parseChatReply('   hola  \n\n  ')
    expect(r.prose).toBe('hola')
  })
})

describe('hasAnyProposal', () => {
  it('is false for null', () => {
    expect(hasAnyProposal(null)).toBe(false)
  })

  it('is false when all arrays are empty', () => {
    expect(
      hasAnyProposal({
        entities: [],
        relationships: [],
        quotes: [],
        reclassifications: [],
      }),
    ).toBe(false)
  })

  it('is true when at least one array has items', () => {
    expect(hasAnyProposal({ entities: [{ name: 'X' }] })).toBe(true)
    expect(hasAnyProposal({ relationships: [{ fromName: 'a', toName: 'b' }] })).toBe(true)
    expect(hasAnyProposal({ quotes: [{ entityName: 'x', text: 'y' }] })).toBe(true)
    expect(hasAnyProposal({ reclassifications: [{ name: 'x', newType: 'y' }] })).toBe(
      true,
    )
  })

  it('ignores non-array values in those keys', () => {
    expect(hasAnyProposal({ entities: 'not-array' as unknown as unknown[] })).toBe(false)
  })
})
