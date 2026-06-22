import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')

function readRepoFile(path: string) {
  return readFileSync(resolve(root, path), 'utf8')
}

function cspDirectiveAllows(csp: string, directive: string, origin: string) {
  const normalized = csp.replace(/\s+/g, ' ')
  const match = new RegExp(`${directive}\\s+([^;"]*)`, 'i').exec(normalized)
  return match ? match[1]!.includes(origin) : false
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

    expect(
      cspDirectiveAllows(
        netlifyToml,
        'script-src',
        'https://static.cloudflareinsights.com',
      ),
    ).toBe(true)
    expect(
      cspDirectiveAllows(netlifyToml, 'connect-src', 'https://cloudflareinsights.com'),
    ).toBe(true)
  })
})
