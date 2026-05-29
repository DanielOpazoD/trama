import { describe, it, expect } from 'vitest'
import { parseTags } from './note-tags'

describe('parseTags', () => {
  it('extrae tags únicos, en minúsculas, en orden de aparición', () => {
    expect(parseTags('idea #Arte sobre el #tiempo y #arte otra vez')).toEqual([
      'arte',
      'tiempo',
    ])
  })

  it('reconoce un tag al inicio del texto', () => {
    expect(parseTags('#inicio del día')).toEqual(['inicio'])
  })

  it('ignora "#" de headers markdown y dentro de palabras/URLs', () => {
    expect(parseTags('# Título\nver a#b y http://x/y#frag')).toEqual([])
  })

  it('sin etiquetas → []', () => {
    expect(parseTags('solo texto plano, sin nada')).toEqual([])
  })
})
