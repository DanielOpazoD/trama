import { describe, it, expect } from 'vitest'
import { detectCaptureIntent, extractUrl, hostLabel } from './captureIntent'

describe('detectCaptureIntent', () => {
  it('trata una URL sola como enlace', () => {
    expect(detectCaptureIntent('https://example.com/articulo')).toBe('link')
    expect(detectCaptureIntent('  http://nyt.com/x  ')).toBe('link')
  })

  it('trata texto plano como nota', () => {
    expect(detectCaptureIntent('una idea suelta')).toBe('note')
    expect(detectCaptureIntent('')).toBe('note')
  })

  it('texto con una URL en medio sigue siendo nota (prosa, no captura)', () => {
    expect(detectCaptureIntent('mira esto https://example.com es genial')).toBe('note')
    expect(detectCaptureIntent('https://a.com y https://b.com')).toBe('note')
  })

  it('ignora esquemas que no son http(s)', () => {
    expect(detectCaptureIntent('ftp://files.com/x')).toBe('note')
    expect(detectCaptureIntent('mailto:hola@example.com')).toBe('note')
  })
})

describe('extractUrl', () => {
  it('devuelve la URL recortada cuando el borrador es un enlace', () => {
    expect(extractUrl('  https://example.com/x  ')).toBe('https://example.com/x')
  })
  it('devuelve null cuando no es un enlace puro', () => {
    expect(extractUrl('texto')).toBeNull()
    expect(extractUrl('mira https://example.com')).toBeNull()
  })
})

describe('hostLabel', () => {
  it('extrae el host sin www', () => {
    expect(hostLabel('https://www.nytimes.com/2026/x')).toBe('nytimes.com')
    expect(hostLabel('https://sub.example.org/a')).toBe('sub.example.org')
  })
  it('devuelve null ante una URL inválida', () => {
    expect(hostLabel('no-es-url')).toBeNull()
  })
})
