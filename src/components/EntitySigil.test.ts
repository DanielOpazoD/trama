import { describe, it, expect } from 'vitest'
import { monogramOf } from './EntitySigil'

describe('monogramOf', () => {
  it('toma las dos iniciales en nombres compuestos', () => {
    expect(monogramOf('Jorge Luis Borges')).toBe('JL')
    expect(monogramOf('Simone de Beauvoir')).toBe('SB') // "de" filtrado
    expect(monogramOf('El Aleph')).toBe('AL') // "El" filtrado, queda "Aleph" → "AL"
  })

  it('en palabra única toma las dos primeras letras', () => {
    expect(monogramOf('Borges')).toBe('BO')
    expect(monogramOf('cervantes')).toBe('CE')
  })

  it('mayúscula siempre', () => {
    expect(monogramOf('jorge luis borges')).toBe('JL')
    expect(monogramOf('borges')).toBe('BO')
  })

  it('palabra única de una sola letra se duplica como mayúscula', () => {
    expect(monogramOf('a')).toBe('A')
  })

  it('strings vacíos o solo espacios devuelven ?', () => {
    expect(monogramOf('')).toBe('?')
    expect(monogramOf('   ')).toBe('?')
  })

  it('filtra stop-words castellanos al elegir las dos iniciales', () => {
    // "La náusea" → significant = ["náusea"] → 2-letras de "náusea" → "NÁ"
    expect(monogramOf('La náusea')).toBe('NÁ')
    expect(monogramOf('Los detectives salvajes')).toBe('DS')
    // "Del amor y otros demonios" → significant = ["amor","otros","demonios"]
    // → iniciales de las dos primeras → "AO"
    expect(monogramOf('Del amor y otros demonios')).toBe('AO')
  })

  it('si TODO son stop-words, cae a las palabras originales', () => {
    expect(monogramOf('el la de')).toBe('EL')
  })

  it('respeta diacríticos y mayúsculas Unicode', () => {
    expect(monogramOf('Álvaro Mutis')).toBe('ÁM')
    expect(monogramOf('Ñañas')).toBe('ÑA')
  })
})
