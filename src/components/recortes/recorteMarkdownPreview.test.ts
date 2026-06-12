import { describe, expect, it } from 'vitest'
import { markdownToPreview } from './recorteMarkdownPreview'

describe('markdownToPreview', () => {
  it('quita marcadores de encabezado, lista y cita', () => {
    const out = markdownToPreview('## Título\n\n- uno\n- dos\n\n> una cita')
    expect(out).toContain('Título')
    expect(out).not.toContain('##')
    expect(out).toContain('• uno')
    expect(out).toContain('• dos')
    expect(out).toContain('una cita')
    expect(out).not.toMatch(/^>/m)
  })

  it('desenvuelve enlaces y énfasis', () => {
    const out = markdownToPreview(
      'Leé [esto](https://x.test/y) con **calma** e *interés*.',
    )
    expect(out).toBe('Leé esto con calma e interés.')
  })

  it('colapsa los bloques de código y los espacios sobrantes', () => {
    const out = markdownToPreview('Antes\n\n```\ncode()\n```\n\n\n\nDespués')
    expect(out).not.toContain('```')
    expect(out).not.toContain('code()')
    expect(out).not.toMatch(/\n{3,}/)
  })

  it('deja intacto el texto sin Markdown', () => {
    expect(markdownToPreview('Una frase normal.')).toBe('Una frase normal.')
  })
})
