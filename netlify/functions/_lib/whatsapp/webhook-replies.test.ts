import { describe, expect, it } from 'vitest'
import {
  buildCaptureReplyText,
  helpMessage,
  notLinkedMessage,
  openInTramaLine,
  parseInlineTags,
  welcomeMessage,
} from './webhook-replies.js'

describe('whatsapp webhook replies', () => {
  it('centralizes help and not-linked copy for the public webhook', () => {
    expect(helpMessage()).toContain('Trama')
    expect(helpMessage()).toContain('nota: <texto>')
    expect(notLinkedMessage()).toContain('vincular ABC123')
  })

  it('builds welcome messages with optional device labels', () => {
    expect(welcomeMessage('iPhone')).toContain('iPhone')
    expect(welcomeMessage()).toContain('Tu número quedó conectado')
  })

  it('keeps capture reply affordances consistent by variant', () => {
    expect(buildCaptureReplyText('Guardado', 'simple')).toContain('deshacer')
    expect(buildCaptureReplyText('Guardado', 'foto')).toContain('descripción')
    expect(buildCaptureReplyText('Guardado', 'ambiguous')).toContain('momento')
    expect(
      buildCaptureReplyText('Guardado', 'simple', {
        openUrl: 'https://trama.test/x',
      }),
    ).toContain('https://trama.test/x')
  })

  it('normalizes inline tags with dedupe and a hard limit', () => {
    expect(parseInlineTags('#work, ideas ideas\nviaje')).toEqual([
      'work',
      'ideas',
      'viaje',
    ])
    expect(parseInlineTags('a b c d e f g h i j k')).toHaveLength(10)
  })

  it('builds deep-link copy without duplicating URL wording in the handler', () => {
    expect(openInTramaLine('https://trama.test', 'note')).toContain('https://trama.test')
  })
})
