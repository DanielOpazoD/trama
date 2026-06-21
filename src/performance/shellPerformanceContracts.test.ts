import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')

function readRepoFile(path: string) {
  return readFileSync(resolve(root, path), 'utf8')
}

describe('shell performance contracts', () => {
  it('carga Google Fonts desde index.html en vez de CSS @import', () => {
    const html = readRepoFile('index.html')
    const css = readRepoFile('src/index.css')

    expect(css).not.toMatch(/@import\s+url\(['"]https:\/\/fonts\.googleapis\.com/i)
    expect(html).toContain('https://fonts.googleapis.com/css2?family=Inter')
    expect(html).toContain('https://fonts.googleapis.com/css2?family=Spectral')
    expect(html).toContain('https://fonts.googleapis.com/css2?family=Caveat')
  })

  it('permite el beacon inyectado por Cloudflare Insights en CSP', () => {
    const netlifyToml = readRepoFile('netlify.toml')

    expect(netlifyToml).toMatch(
      /script-src[^"]*https:\/\/static\.cloudflareinsights\.com/,
    )
    expect(netlifyToml).toMatch(/connect-src[^"]*https:\/\/cloudflareinsights\.com/)
  })
})
