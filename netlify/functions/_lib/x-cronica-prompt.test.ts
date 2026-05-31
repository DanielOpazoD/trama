import { describe, expect, it } from 'vitest'
import { buildBookmarkCronicaMessages } from './x/cronica'

describe('x cronica — prompt', () => {
  it('arma system + user con autor y tema', () => {
    const msgs = buildBookmarkCronicaMessages([
      { text: 'GPT-5 cambió todo', authorUsername: 'sama', topic: 'IA' },
      { text: 'nuevo paper de oncología', authorUsername: null, topic: 'Medicina' },
    ])
    expect(msgs).toHaveLength(2)
    expect(msgs[0]!.role).toBe('system')
    expect(msgs[0]!.content).toContain('crónica')
    expect(msgs[1]!.content).toContain('[IA] @sama:')
    expect(msgs[1]!.content).toContain('[Medicina]')
  })

  it('recorta a 60 items y a 200 chars por tweet', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      text: 'x'.repeat(400),
      authorUsername: `u${i}`,
      topic: null,
    }))
    const msgs = buildBookmarkCronicaMessages(many)
    const lines = msgs[1]!.content.split('\n').filter((l) => /^\d+\./.test(l))
    expect(lines.length).toBe(60)
  })
})
