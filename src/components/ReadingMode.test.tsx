/**
 * Tests for the pure chunking + merge helpers in ReadingMode. We re-create
 * the helpers inline below to avoid having to export them from the
 * component file (keeps the public surface small). If the algorithm
 * drifts, copy the new version here.
 */
import { describe, expect, it } from 'vitest'
import type { ExtractionProposal } from '../types'

const CHUNK_TARGET_CHARS = 3000
const SINGLE_CALL_THRESHOLD = 4500

function chunkText(text: string, target = CHUNK_TARGET_CHARS): string[] {
  const trimmed = text.trim()
  if (trimmed.length <= SINGLE_CALL_THRESHOLD) return [trimmed]
  const paragraphs = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let buf = ''
  for (const p of paragraphs) {
    if (buf.length + p.length + 2 > target && buf.length > 0) {
      chunks.push(buf)
      buf = p
    } else {
      buf = buf ? `${buf}\n\n${p}` : p
    }
  }
  if (buf) chunks.push(buf)
  const out: string[] = []
  for (const c of chunks) {
    if (c.length <= target * 1.5) out.push(c)
    else for (let i = 0; i < c.length; i += target) out.push(c.slice(i, i + target))
  }
  return out
}

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    expect(chunkText('hola que tal')).toEqual(['hola que tal'])
  })

  it('returns a single chunk when below the threshold even if multi-paragraph', () => {
    const text = ['parrafo uno.', 'parrafo dos.', 'parrafo tres.'].join('\n\n')
    expect(chunkText(text)).toEqual([text])
  })

  it('splits a long text at paragraph boundaries', () => {
    const longPara = 'lorem ipsum dolor sit amet '.repeat(80) // ~2200 chars
    const text = [longPara, longPara, longPara].join('\n\n') // ~6700 chars total
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
    // No chunk should be wildly larger than target
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(CHUNK_TARGET_CHARS * 1.5)
    }
  })

  it('hard-splits paragraphs that exceed the target by themselves', () => {
    const monsterPara = 'x'.repeat(7000)
    const chunks = chunkText(monsterPara)
    // Should split into at least 2 pieces, none catastrophically large.
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(CHUNK_TARGET_CHARS)
    }
  })
})

// ---- merge ----

function mergeProposals(parts: ExtractionProposal[]): ExtractionProposal {
  const entityKey = (e: { name: string; type: string }) =>
    `${e.name.trim().toLowerCase()}|${e.type}`
  const relKey = (r: { fromName: string; toName: string; type: string }) =>
    `${r.fromName.trim().toLowerCase()}|${r.type}|${r.toName.trim().toLowerCase()}`
  const quoteKey = (q: { entityName: string; text: string }) =>
    `${q.entityName.trim().toLowerCase()}|${q.text.trim().toLowerCase().slice(0, 80)}`
  const entitiesByKey = new Map<string, ExtractionProposal['entities'][number]>()
  const relsByKey = new Map<string, ExtractionProposal['relationships'][number]>()
  const quotesByKey = new Map<string, ExtractionProposal['quotes'][number]>()
  for (const p of parts) {
    for (const e of p.entities) entitiesByKey.set(entityKey(e), e)
    for (const r of p.relationships) relsByKey.set(relKey(r), r)
    for (const q of p.quotes) quotesByKey.set(quoteKey(q), q)
  }
  return {
    entities: Array.from(entitiesByKey.values()),
    relationships: Array.from(relsByKey.values()),
    quotes: Array.from(quotesByKey.values()),
  }
}

describe('mergeProposals', () => {
  it('dedupes entities across chunks by name + type', () => {
    const merged = mergeProposals([
      {
        entities: [{ type: 'persona', name: 'Borges' }],
        relationships: [],
        quotes: [],
      },
      {
        entities: [
          { type: 'persona', name: 'Borges' },
          { type: 'persona', name: 'Cortázar' },
        ],
        relationships: [],
        quotes: [],
      },
    ])
    expect(merged.entities.length).toBe(2)
    expect(merged.entities.map((e) => e.name).sort()).toEqual(['Borges', 'Cortázar'])
  })

  it('dedupes relationships by from/to/type triple', () => {
    const merged = mergeProposals([
      {
        entities: [],
        relationships: [{ fromName: 'A', toName: 'B', type: 'influye_en' }],
        quotes: [],
      },
      {
        entities: [],
        relationships: [
          { fromName: 'a', toName: 'B', type: 'influye_en' }, // case insensitive
          { fromName: 'A', toName: 'C', type: 'cita_a' },
        ],
        quotes: [],
      },
    ])
    expect(merged.relationships.length).toBe(2)
  })

  it('dedupes quotes on text prefix (first 80 chars) per entity', () => {
    const longText = 'frase muy larga que sigue y sigue '.repeat(10)
    const merged = mergeProposals([
      { entities: [], relationships: [], quotes: [{ entityName: 'X', text: longText }] },
      { entities: [], relationships: [], quotes: [{ entityName: 'X', text: longText }] },
    ])
    expect(merged.quotes.length).toBe(1)
  })
})
