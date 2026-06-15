import { describe, expect, it } from 'vitest'
import { transcriptionToIntent } from './transcribe'

describe('transcriptionToIntent', () => {
  it('convierte el texto transcrito en una Nota', () => {
    expect(transcriptionToIntent('  comprar pan y leche  ')).toEqual({
      kind: 'note',
      content: 'comprar pan y leche',
    })
  })

  it('una transcripción vacía cae a null (el caller avisa)', () => {
    expect(transcriptionToIntent('')).toBeNull()
    expect(transcriptionToIntent('   ')).toBeNull()
  })

  it('recorta transcripciones larguísimas al límite de la nota', () => {
    const long = 'a'.repeat(25000)
    const intent = transcriptionToIntent(long)
    expect(intent?.kind).toBe('note')
    expect((intent as { content: string }).content.length).toBe(20000)
  })
})
