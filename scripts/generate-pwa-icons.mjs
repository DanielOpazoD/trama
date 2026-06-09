/**
 * Genera los PNG de la PWA desde el monograma de Trama (one-off, re-ejecutable):
 *
 *   node scripts/generate-pwa-icons.mjs
 *
 * - public/apple-touch-icon.png (180): iOS IGNORA los SVG en apple-touch-icon
 *   (cae al screenshot genérico). Fondo a sangre completa SIN esquinas
 *   redondeadas — iOS aplica su propia máscara squircle.
 * - public/icon-192.png / public/icon-512.png (maskable): fondo a sangre y
 *   monograma dentro de la zona segura (~80%) para que Android pueda aplicar
 *   cualquier máscara sin cortar el glifo.
 *
 * Usa el Chromium de Playwright (ya instalado para e2e) — sin dependencias nuevas.
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Monograma de Trama a sangre completa (el viewBox 180 del icon original). */
function iconSvg(size, { glyphScale = 1 } = {}) {
  // El glifo del apple-touch-icon.svg vive en un lienzo de 180; lo escalamos
  // alrededor del centro para dejar la zona segura de los maskable.
  const s = (size / 180) * glyphScale
  const t = (size - 180 * s) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#fafafa" />
  <g transform="translate(${t} ${t}) scale(${s})">
    <path d="M40 65h100" stroke="#18181b" stroke-width="11" stroke-linecap="round" />
    <path d="M90 65v75" stroke="#18181b" stroke-width="11" stroke-linecap="round" />
    <path d="M65 95l50 30M115 95l-50 30" stroke="#18181b" stroke-width="7" stroke-linecap="round" stroke-opacity="0.55" />
  </g>
</svg>`
}

async function renderPng(page, svg, size, outFile) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<!doctype html><html><head><style>html,body{margin:0;padding:0}</style></head><body>${svg}</body></html>`,
  )
  await page.screenshot({
    path: outFile,
    clip: { x: 0, y: 0, width: size, height: size },
  })
  console.log(`✓ ${outFile}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })
await mkdir(resolve(root, 'public'), { recursive: true })

// iOS: a sangre, sin radius (iOS enmascara solo).
await renderPng(page, iconSvg(180), 180, resolve(root, 'public/apple-touch-icon.png'))
// Android maskable: glifo al ~78% para la zona segura de la máscara.
await renderPng(
  page,
  iconSvg(192, { glyphScale: 0.78 }),
  192,
  resolve(root, 'public/icon-192.png'),
)
await renderPng(
  page,
  iconSvg(512, { glyphScale: 0.78 }),
  512,
  resolve(root, 'public/icon-512.png'),
)

await browser.close()
