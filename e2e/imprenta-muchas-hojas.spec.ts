import { expect, test } from '@playwright/test'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { emptyState, mockBackend } from './fixtures'

/**
 * Imprenta con un libro largo: la grilla tiene que poder recorrerse entera.
 *
 * La sección de Imprenta se monta dentro de un contenedor `display: block`, así
 * que su `flex-1` no le daba altura: la sección crecía con la grilla (600 hojas
 * ≈ 16.000px), el `overflow-y-auto` del área de trabajo nunca se activaba y todo
 * lo que pasaba del alto de pantalla quedaba recortado por el `overflow-hidden`
 * del `main`. Se cargaban las 600 hojas y no había forma de llegar a la 90.
 *
 * Esto no lo puede ver un test de unidad: en happy-dom no hay layout, todas las
 * alturas son 0 y el recorte no existe. Hace falta un navegador de verdad.
 */

const HOJAS = 90

async function libroDePrueba(): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let index = 0; index < HOJAS; index += 1) {
    const page = pdf.addPage([420, 594])
    page.drawText(`${index + 1}`, {
      x: 170,
      y: 270,
      size: 96,
      font,
      color: rgb(0.15, 0.15, 0.15),
    })
  }
  return Buffer.from(await pdf.save())
}

test.describe('Imprenta con muchas hojas', () => {
  test('la grilla scrollea y se llega a la última hoja', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('trama:splash-seen', '1')
    })
    await mockBackend(page, emptyState())
    await page.goto('/?world=notas&section=pdf')

    await page.getByLabel('Archivo PDF o imagen').setInputFiles({
      name: 'libro-largo.pdf',
      mimeType: 'application/pdf',
      buffer: await libroDePrueba(),
    })
    await expect(page.getByAltText('Página 1').first()).toBeVisible({ timeout: 20_000 })

    const area = page.locator('.pdf-studio-canvas')
    const medidas = await area.evaluate((el) => ({
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
    }))
    // El área de trabajo es la que scrollea, no la sección entera.
    expect(medidas.clientH).toBeGreaterThan(0)
    expect(medidas.scrollH).toBeGreaterThan(medidas.clientH + 1)

    // Y la última hoja se alcanza de verdad: antes quedaba fuera del viewport
    // sin ningún scroll que la trajera.
    const ultima = page.getByLabel(new RegExp(`Página ${HOJAS} de ${HOJAS}\\.`))
    await area.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await expect(ultima).toBeInViewport()
  })
})
