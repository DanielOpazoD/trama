import { describe, expect, it } from 'vitest'
import { buildPhotoPrompt, validatePhotoExtraction } from './vision'

describe('buildPhotoPrompt', () => {
  it('modo quote pide text + author en JSON', () => {
    const p = buildPhotoPrompt('quote')
    expect(p.system).toContain('"author"')
    expect(p.system).toContain('JSON')
  })
  it('modo text pide solo transcripción', () => {
    const p = buildPhotoPrompt('text')
    expect(p.system).toContain('OCR')
    expect(p.system).not.toContain('"author"')
  })
})

describe('validatePhotoExtraction', () => {
  it('quote con texto + autor → CaptureIntent quote', () => {
    expect(
      validatePhotoExtraction(
        { text: 'el tiempo es relativo', author: 'Einstein' },
        'quote',
        '',
      ),
    ).toEqual({ kind: 'quote', text: 'el tiempo es relativo', author: 'Einstein' })
  })

  it('quote sin autor cae a nota (nunca pide autor por foto)', () => {
    expect(
      validatePhotoExtraction({ text: 'una frase suelta', author: '' }, 'quote', ''),
    ).toEqual({
      kind: 'note',
      content: 'una frase suelta',
    })
  })

  it('text → nota con la transcripción', () => {
    expect(
      validatePhotoExtraction({ text: 'apuntes de la pizarra' }, 'text', ''),
    ).toEqual({
      kind: 'note',
      content: 'apuntes de la pizarra',
    })
  })

  it('sin texto usa el caption como fallback', () => {
    expect(validatePhotoExtraction({}, 'text', 'mi caption')).toEqual({
      kind: 'note',
      content: 'mi caption',
    })
  })

  it('sin texto ni caption usa un texto mínimo', () => {
    const r = validatePhotoExtraction(null, 'quote', '')
    expect(r.kind).toBe('note')
    expect((r as { content: string }).content).toContain('WhatsApp')
  })
})
