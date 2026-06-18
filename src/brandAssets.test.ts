import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')

function readText(path: string): string {
  return readFileSync(resolve(root, path), 'utf8')
}

function readPngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(resolve(root, path))
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  }
}

describe('brand assets', () => {
  it('usa una Open Graph PNG dedicada con dimensiones sociales', () => {
    const html = readText('index.html')

    expect(html).toContain('<meta property="og:image" content="/og-image.png" />')
    expect(html).toContain('<meta property="og:image:width" content="1200" />')
    expect(html).toContain('<meta property="og:image:height" content="630" />')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
    expect(html).toContain('<meta name="twitter:image" content="/og-image.png" />')

    expect(existsSync(resolve(root, 'public/og-image.png'))).toBe(true)
    expect(readPngSize('public/og-image.png')).toEqual({ width: 1200, height: 630 })
  })

  it('no deja referencias ni archivos SVG legacy del monograma anterior', () => {
    const html = readText('index.html')
    expect(html).not.toMatch(/favicon\.svg|apple-touch-icon\.svg|og-image\.svg/)
    expect(existsSync(resolve(root, 'public/favicon.svg'))).toBe(false)
    expect(existsSync(resolve(root, 'public/apple-touch-icon.svg'))).toBe(false)
    expect(existsSync(resolve(root, 'public/og-image.svg'))).toBe(false)
  })
})
