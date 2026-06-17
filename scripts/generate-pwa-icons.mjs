/**
 * Genera los íconos de Trama desde el logo fuente.
 *
 *   node scripts/generate-pwa-icons.mjs
 *
 * Fuente:
 * - public/trama-logo-source.png: logo completo recibido como imagen.
 *
 * Salidas:
 * - public/trama-icon.png: isotipo recortado, sin texto, 1024px.
 * - public/favicon-32.png / public/favicon-48.png: favicon PNG.
 * - public/apple-touch-icon.png: iOS (180px).
 * - public/icon-192.png / public/icon-512.png: PWA maskable.
 * - public/og-image.png: preview social 1200x630 con isotipo nuevo.
 *
 * Usa Chromium de Playwright, ya instalado para e2e; no agrega dependencias.
 */
import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = resolve(root, 'public')
const sourceFile = resolve(publicDir, 'trama-logo-source.png')

// Recorte cuadrado del isotipo: conserva el símbolo completo y excluye el texto.
const SOURCE_CROP = {
  x: 247,
  y: 150,
  size: 760,
}

const PAPER = '#fbf8f1'

async function renderIcon(page, sourceDataUrl, size, outFile, { glyphScale }) {
  const pngBase64 = await page.evaluate(
    async ({ crop, glyphScale: scale, paper, size: canvasSize, source }) => {
      const image = new globalThis.Image()
      image.src = source
      await image.decode()

      const canvas = globalThis.document.createElement('canvas')
      canvas.width = canvasSize
      canvas.height = canvasSize
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas no disponible')

      ctx.fillStyle = paper
      ctx.fillRect(0, 0, canvasSize, canvasSize)

      const drawSize = Math.round(canvasSize * scale)
      const offset = Math.round((canvasSize - drawSize) / 2)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(
        image,
        crop.x,
        crop.y,
        crop.size,
        crop.size,
        offset,
        offset,
        drawSize,
        drawSize,
      )

      return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
    },
    { crop: SOURCE_CROP, glyphScale, paper: PAPER, size, source: sourceDataUrl },
  )
  await writeFile(outFile, Buffer.from(pngBase64, 'base64'))
  console.log(`✓ ${outFile}`)
}

async function renderOgImage(page, sourceDataUrl, outFile) {
  const pngBase64 = await page.evaluate(
    async ({ crop, paper, source }) => {
      const image = new globalThis.Image()
      image.src = source
      await image.decode()

      const canvas = globalThis.document.createElement('canvas')
      canvas.width = 1200
      canvas.height = 630
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas no disponible')

      ctx.fillStyle = paper
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.fillStyle = '#08294a'
      ctx.font = '700 92px Georgia, serif'
      ctx.fillText('Trama', 112, 252)

      ctx.fillStyle = '#4a5563'
      ctx.font = '400 32px Arial, sans-serif'
      ctx.fillText('Tu mapa cognitivo personal', 118, 318)

      ctx.fillStyle = '#a87f00'
      ctx.fillRect(118, 374, 92, 4)

      const drawSize = 380
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(
        image,
        crop.x,
        crop.y,
        crop.size,
        crop.size,
        710,
        118,
        drawSize,
        drawSize,
      )

      return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
    },
    { crop: SOURCE_CROP, paper: PAPER, source: sourceDataUrl },
  )
  await writeFile(outFile, Buffer.from(pngBase64, 'base64'))
  console.log(`✓ ${outFile}`)
}

const source = await readFile(sourceFile)
const sourceDataUrl = `data:image/png;base64,${source.toString('base64')}`

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })
await mkdir(publicDir, { recursive: true })

await renderIcon(page, sourceDataUrl, 1024, resolve(publicDir, 'trama-icon.png'), {
  glyphScale: 0.9,
})
await renderIcon(page, sourceDataUrl, 32, resolve(publicDir, 'favicon-32.png'), {
  glyphScale: 1,
})
await renderIcon(page, sourceDataUrl, 48, resolve(publicDir, 'favicon-48.png'), {
  glyphScale: 1,
})
await renderIcon(page, sourceDataUrl, 180, resolve(publicDir, 'apple-touch-icon.png'), {
  glyphScale: 0.88,
})
await renderIcon(page, sourceDataUrl, 192, resolve(publicDir, 'icon-192.png'), {
  glyphScale: 0.78,
})
await renderIcon(page, sourceDataUrl, 512, resolve(publicDir, 'icon-512.png'), {
  glyphScale: 0.78,
})
await renderOgImage(page, sourceDataUrl, resolve(publicDir, 'og-image.png'))

await browser.close()
