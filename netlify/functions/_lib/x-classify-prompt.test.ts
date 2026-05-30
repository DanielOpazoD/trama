import { describe, expect, it } from 'vitest'
import { buildClassifyMessages, parseClassifications } from './x/classify'

/**
 * Funciones puras de la clasificación por tema (sin red ni DB).
 */
describe('x classify — prompt + parser', () => {
  it('arma system + user con los ids y la taxonomía', () => {
    const msgs = buildClassifyMessages([
      { id: 'a', text: 'GPT-5 cambió todo' },
      { id: 'b', text: 'nuevo paper sobre cáncer' },
    ])
    expect(msgs).toHaveLength(2)
    expect(msgs[0]!.role).toBe('system')
    expect(msgs[0]!.content).toContain('IA')
    expect(msgs[0]!.content).toContain('Medicina')
    expect(msgs[1]!.content).toContain('[id:a]')
    expect(msgs[1]!.content).toContain('[id:b]')
  })

  it('colapsa whitespace y recorta textos largos', () => {
    const long = 'x'.repeat(500)
    const msgs = buildClassifyMessages([{ id: 'a', text: `hola\n\n  mundo ${long}` }])
    expect(msgs[1]!.content).toContain('hola mundo')
    // 280 de tope + el prefijo "[id:a] " — bien por debajo de 500.
    expect(msgs[1]!.content.length).toBeLessThan(360)
  })

  it('parsea id→tema y descarta temas fuera de la taxonomía', () => {
    const map = parseClassifications({
      classifications: [
        { id: 'a', topic: 'IA' },
        { id: 'b', topic: 'Medicina' },
        { id: 'c', topic: 'Inventado' }, // inválido → se descarta
        { id: 'd' }, // sin topic → se descarta
      ],
    })
    expect(map.get('a')).toBe('IA')
    expect(map.get('b')).toBe('Medicina')
    expect(map.has('c')).toBe(false)
    expect(map.has('d')).toBe(false)
  })

  it('devuelve mapa vacío si la forma no es la esperada', () => {
    expect(parseClassifications(null).size).toBe(0)
    expect(parseClassifications({ foo: 1 }).size).toBe(0)
    expect(parseClassifications('nope').size).toBe(0)
  })
})
