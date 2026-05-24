import { describe, it, expect } from 'vitest'
import { decodeEntities, findMeta, findTitle, prettySource } from './og-parse'

describe('decodeEntities', () => {
  it('decodifica entidades básicas (amp, lt, gt, quot, apos, 39)', () => {
    expect(decodeEntities('A &amp; B')).toBe('A & B')
    expect(decodeEntities('&lt;div&gt;')).toBe('<div>')
    expect(decodeEntities('&quot;hola&quot;')).toBe('"hola"')
    expect(decodeEntities("It&apos;s")).toBe("It's")
    expect(decodeEntities("It&#39;s")).toBe("It's")
  })

  it('decodifica entidades castellanas (ñ, á, é, í, ó, ú, ¿, ¡)', () => {
    expect(decodeEntities('ma&ntilde;ana')).toBe('mañana')
    expect(decodeEntities('&iquest;C&oacute;mo est&aacute;s?')).toBe('¿Cómo estás?')
    expect(decodeEntities('&Aacute;lvaro')).toBe('Álvaro')
    expect(decodeEntities('umbr&uuml;l')).toBe('umbrül')
  })

  it('decodifica entidades tipográficas', () => {
    expect(decodeEntities('&ldquo;hola&rdquo;')).toBe('“hola”')
    expect(decodeEntities('a&mdash;b')).toBe('a—b')
    expect(decodeEntities('&hellip;')).toBe('…')
  })

  it('decodifica numeric decimal (&#NNN;)', () => {
    expect(decodeEntities('&#241;')).toBe('ñ') // ñ = 0xF1 = 241
    expect(decodeEntities('A&#38;B')).toBe('A&B')
  })

  it('decodifica numeric hex (&#xHH;)', () => {
    expect(decodeEntities('&#xF1;')).toBe('ñ')
    expect(decodeEntities('&#x2014;')).toBe('—')
  })

  it('deja entidades desconocidas crudas', () => {
    expect(decodeEntities('&unknown;')).toBe('&unknown;')
    expect(decodeEntities('texto sin entidades')).toBe('texto sin entidades')
  })

  it('no rompe con string vacía', () => {
    expect(decodeEntities('')).toBe('')
  })
})

describe('prettySource', () => {
  it('devuelve hostname sin www.', () => {
    expect(prettySource('https://www.nytimes.com/article/123')).toBe('nytimes.com')
    expect(prettySource('http://example.com')).toBe('example.com')
  })

  it('respeta subdominios que no son www', () => {
    expect(prettySource('https://blog.example.com/post')).toBe('blog.example.com')
    expect(prettySource('https://m.twitter.com/x')).toBe('m.twitter.com')
  })

  it('devuelve null si la URL es inválida', () => {
    expect(prettySource('no-es-url')).toBe(null)
    expect(prettySource('')).toBe(null)
  })
})

describe('findMeta', () => {
  it('encuentra og:title con property antes y content después', () => {
    const html = `<head><meta property="og:title" content="Un título"></head>`
    expect(findMeta(html, 'og:title')).toBe('Un título')
  })

  it('encuentra og:title con content antes y property después', () => {
    const html = `<head><meta content="Otro título" property="og:title"></head>`
    expect(findMeta(html, 'og:title')).toBe('Otro título')
  })

  it('encuentra meta por name= (no solo property=)', () => {
    const html = `<meta name="description" content="Una descripción">`
    expect(findMeta(html, 'description')).toBe('Una descripción')
  })

  it('es case-insensitive en el match', () => {
    const html = `<META PROPERTY="og:title" CONTENT="Capital">`
    expect(findMeta(html, 'og:title')).toBe('Capital')
  })

  it('decodifica entidades en el content', () => {
    const html = `<meta property="og:title" content="A &amp; B">`
    expect(findMeta(html, 'og:title')).toBe('A & B')
  })

  it('devuelve null si no encuentra', () => {
    expect(findMeta('<head></head>', 'og:title')).toBe(null)
    expect(findMeta('', 'og:title')).toBe(null)
  })

  it('escapea chars regex en el key para que sea seguro', () => {
    // Si el key incluye chars regex como ":" o ".", no debe romper.
    const html = `<meta property="article:author" content="x">`
    expect(findMeta(html, 'article:author')).toBe('x')
  })

  it('trimea el resultado', () => {
    const html = `<meta property="og:title" content="   con espacios   ">`
    expect(findMeta(html, 'og:title')).toBe('con espacios')
  })
})

describe('findTitle', () => {
  it('extrae el contenido del <title>', () => {
    const html = '<html><head><title>Mi página</title></head></html>'
    expect(findTitle(html)).toBe('Mi página')
  })

  it('decodifica entidades dentro del title', () => {
    const html = '<title>A &amp; B</title>'
    expect(findTitle(html)).toBe('A & B')
  })

  it('maneja title con atributos', () => {
    const html = '<title data-foo="bar">X</title>'
    expect(findTitle(html)).toBe('X')
  })

  it('null si no hay title', () => {
    expect(findTitle('<head></head>')).toBe(null)
    expect(findTitle('')).toBe(null)
  })

  it('toma el primer title si hay varios (raro pero válido)', () => {
    const html = '<title>Uno</title><title>Dos</title>'
    expect(findTitle(html)).toBe('Uno')
  })
})
