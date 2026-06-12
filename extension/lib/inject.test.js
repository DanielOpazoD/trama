import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  pageExtractArticle,
  pageExtractHTML,
  pageExtractStructured,
  readPageMeta,
} from './inject.js'

/**
 * Extractores inyectados (corren en el contexto de la página). Se ejercitan
 * con happy-dom construyendo el DOM y, para los estructurados, fijando la URL.
 */

function setUrl(url) {
  // vitest+happy-dom expone window.happyDOM para reescribir la location.
  window.happyDOM?.setURL?.(url)
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})
afterEach(() => setUrl('http://localhost:3000/'))

describe('readPageMeta', () => {
  it('lee autor y título de los meta tags', () => {
    document.head.innerHTML = `
      <meta name="author" content="Ada Lovelace" />
      <meta property="og:title" content="Sobre máquinas analíticas" />`
    expect(readPageMeta()).toEqual({
      author: 'Ada Lovelace',
      title: 'Sobre máquinas analíticas',
    })
  })

  it('cae al twitter:creator y al document.title si faltan', () => {
    // El title se setea DESPUÉS del head.innerHTML: asignarlo crea un <title>
    // y sobrescribir head.innerHTML lo borraría.
    document.head.innerHTML = `<meta name="twitter:creator" content="@ada" />`
    document.title = 'Título de la pestaña'
    const meta = readPageMeta()
    expect(meta.author).toBe('@ada')
    expect(meta.title).toBe('Título de la pestaña')
  })
})

describe('pageExtractArticle', () => {
  it('junta la prosa del <article> y toma el byline del meta', () => {
    document.head.innerHTML = `<meta name="author" content="Otra Parte" />`
    const body = 'La memoria es un taller. '.repeat(20)
    document.body.innerHTML = `
      <article>
        <h1>El taller de la memoria</h1>
        <p>${body}</p>
        <p>${body}</p>
      </article>`
    const res = pageExtractArticle()
    expect(res).not.toBeNull()
    expect(res.text).toContain('El taller de la memoria')
    expect(res.text).toContain('La memoria es un taller')
    expect(res.byline).toBe('Otra Parte')
  })

  it('devuelve null si no hay suficiente texto (no es un artículo)', () => {
    document.body.innerHTML = `<article><p>Corto.</p></article>`
    expect(pageExtractArticle()).toBeNull()
  })
})

describe('pageExtractHTML (Markdown)', () => {
  it('convierte estructura a Markdown: encabezados, listas, énfasis, enlaces', () => {
    const filler =
      'Texto de relleno suficientemente largo para superar el mínimo. '.repeat(3)
    document.body.innerHTML = `
      <main>
        <h2>El cuaderno</h2>
        <p>Escribir <strong>a mano</strong> y con <a href="https://x.test/y">enlace</a>.</p>
        <p>${filler}</p>
        <ul><li>uno</li><li>dos</li></ul>
        <blockquote>una cita</blockquote>
      </main>`
    const res = pageExtractHTML()
    expect(res).not.toBeNull()
    expect(res.text).toContain('## El cuaderno')
    expect(res.text).toContain('**a mano**')
    expect(res.text).toContain('[enlace](https://x.test/y)')
    expect(res.text).toContain('- uno')
    expect(res.text).toContain('- dos')
    expect(res.text).toContain('> una cita')
  })

  it('descarta enlaces javascript: dejando solo el texto', () => {
    const filler = 'Relleno largo para superar el umbral mínimo de extracción. '.repeat(3)
    document.body.innerHTML = `
      <main>
        <p>Mira <a href="javascript:void(0)">esto</a> ahora.</p>
        <p>${filler}</p>
      </main>`
    const res = pageExtractHTML()
    expect(res.text).toContain('Mira esto ahora.')
    expect(res.text).not.toContain('javascript:')
  })
})

describe('pageExtractStructured', () => {
  it('extrae un tweet de x.com (autor + texto + permalink)', () => {
    setUrl('https://x.com/ada/status/123')
    document.body.innerHTML = `
      <article data-testid="tweet">
        <div data-testid="User-Name">Ada Lovelace</div>
        <div data-testid="tweetText">Las máquinas pueden tejer álgebra.</div>
        <a href="/ada/status/123"><time datetime="2026-06-12"></time></a>
      </article>`
    const res = pageExtractStructured()
    expect(res).not.toBeNull()
    expect(res.text).toBe('Las máquinas pueden tejer álgebra.')
    expect(res.author).toBe('Ada Lovelace')
    expect(res.url).toContain('/ada/status/123')
    expect(res.title).toContain('Ada Lovelace')
  })

  it('extrae un post de reddit (título + cuerpo + u/autor)', () => {
    setUrl('https://www.reddit.com/r/books/comments/1/x/')
    document.body.innerHTML = `
      <shreddit-post post-title="Sobre releer" author="ada" permalink="/r/books/comments/1/x/">
        <div slot="text-body">Releer es siempre una primera vez distinta.</div>
      </shreddit-post>`
    const res = pageExtractStructured()
    expect(res).not.toBeNull()
    expect(res.text).toContain('Sobre releer')
    expect(res.text).toContain('Releer es siempre')
    expect(res.author).toBe('u/ada')
    expect(res.url).toContain('/r/books/comments/1/x/')
  })

  it('devuelve null en un host no soportado', () => {
    setUrl('https://example.com/x')
    document.body.innerHTML = `<article><p>algo</p></article>`
    expect(pageExtractStructured()).toBeNull()
  })
})
