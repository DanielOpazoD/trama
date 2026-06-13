import { describe, expect, it } from 'vitest'
import { normalizePhone, maskPhone } from './phone'
import { generateLinkCode, normalizeLinkCode } from './link-code'
import { buildTwiml } from './twiml'

describe('normalizePhone', () => {
  it('quita el prefijo whatsapp: y separadores', () => {
    expect(normalizePhone('whatsapp:+56 9 1234 5678')).toBe('+56912345678')
    expect(normalizePhone('WhatsApp:+14155238886')).toBe('+14155238886')
    expect(normalizePhone('+1 (415) 523-8886')).toBe('+14155238886')
  })

  it('null si no es E164', () => {
    expect(normalizePhone('hola')).toBeNull()
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })
})

describe('maskPhone', () => {
  it('enmascara el medio', () => {
    const m = maskPhone('+56912345678')
    expect(m.startsWith('+569')).toBe(true)
    expect(m.endsWith('5678')).toBe(true)
    expect(m).toContain('·')
  })
})

describe('link codes', () => {
  it('genera 6 caracteres del alfabeto sin ambigüedades', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateLinkCode()
      expect(c).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    }
  })

  it('normaliza espacios, guiones y mayúsculas', () => {
    expect(normalizeLinkCode(' ab-cd 23 ')).toBe('ABCD23')
    expect(normalizeLinkCode('abcd23')).toBe('ABCD23')
  })

  it('null si no encaja largo o charset', () => {
    expect(normalizeLinkCode('abc')).toBeNull()
    expect(normalizeLinkCode('ABCD2I')).toBeNull() // I no está en el charset
    expect(normalizeLinkCode(null)).toBeNull()
  })
})

describe('buildTwiml', () => {
  it('envuelve en Response/Message y escapa XML', () => {
    const xml = buildTwiml('hola <b> & "x"')
    expect(xml).toContain('<Response><Message>')
    expect(xml).toContain('&lt;b&gt;')
    expect(xml).toContain('&amp;')
    expect(xml).toContain('&quot;')
  })
})
