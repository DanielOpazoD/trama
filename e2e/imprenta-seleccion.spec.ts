import { expect, test, type Page } from '@playwright/test'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { emptyState, enableDemoMode, mockBackend } from './fixtures'

/**
 * Elegir hojas en Imprenta sin apuntar al tick, y traer de vuelta lo guardado.
 *
 * Los dos gestos nuevos (#425) —modificadores sobre la tarjeta entera y
 * Espacio con la tarjeta enfocada— tienen tests de unidad sobre `PageCard`,
 * pero esos tests disparan eventos sintéticos: no prueban que un clic real con
 * Shift sobre una tarjeta arrastrable no arranque un drag, ni que el foco llegue
 * a la tarjeta por teclado. Eso solo lo dice un navegador.
 *
 * El tercer test cubre #426 desde el lado del usuario: un PDF guardado de
 * Imprenta aparece en Biblioteca y vuelve a Imprenta desde ahí. En modo prueba
 * el blob lo sirve `demoMedia` por la misma ruta que usaría producción.
 */

const HOJAS = 6

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function cuadernillo(): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let index = 0; index < HOJAS; index += 1) {
    const page = pdf.addPage([420, 594])
    page.drawText(`${index + 1}`, {
      x: 170,
      y: 270,
      size: 96,
      font,
      color: rgb(0.2, 0.2, 0.2),
    })
  }
  return Buffer.from(await pdf.save())
}

async function abrirCuadernillo(page: Page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('trama:splash-seen', '1')
  })
  await mockBackend(page, emptyState())
  await page.goto('/?world=notas&section=pdf')
  await page.getByLabel('Archivo PDF o imagen').setInputFiles({
    name: 'cuadernillo.pdf',
    mimeType: 'application/pdf',
    buffer: await cuadernillo(),
  })
  await expect(page.getByAltText('Página 1').first()).toBeVisible({ timeout: 20_000 })
}

const hoja = (page: Page, n: number) =>
  page.getByLabel(new RegExp(`^Página ${n} de ${HOJAS}\\.`))
const tick = (page: Page, n: number) =>
  page.getByRole('button', { name: new RegExp(`^(Marcar|Desmarcar) la hoja ${n}$`) })
const barra = (page: Page) => page.getByRole('toolbar', { name: 'Barra de hojas de PDF' })

test.describe('Imprenta · elegir hojas sin apuntar', () => {
  test('Shift+clic sobre las tarjetas extiende el rango y ⌘/Ctrl+clic alterna una', async ({
    page,
  }) => {
    await abrirCuadernillo(page)

    // El ancla se pone con el tick, como siempre.
    await tick(page, 2).click()
    await expect(barra(page)).toContainText('1 marcada')

    // El rango se extiende con Shift+clic EN LA TARJETA, no en el tick: la
    // tarjeta es arrastrable y un clic con Shift no debe arrancar un drag.
    await hoja(page, 5).click({ modifiers: ['Shift'] })
    await expect(barra(page)).toContainText('4 marcadas')
    for (const n of [2, 3, 4, 5]) {
      await expect(tick(page, n)).toHaveAttribute('aria-pressed', 'true')
    }
    await expect(tick(page, 1)).toHaveAttribute('aria-pressed', 'false')

    // ⌘/Ctrl+clic saca una del medio sin tocar el resto.
    await hoja(page, 3).click({ modifiers: ['ControlOrMeta'] })
    await expect(barra(page)).toContainText('3 marcadas')
    await expect(tick(page, 3)).toHaveAttribute('aria-pressed', 'false')
    await expect(tick(page, 4)).toHaveAttribute('aria-pressed', 'true')

    // Un clic simple sigue sin marcar: es el gesto de arrastrar y del doble clic.
    await hoja(page, 1).click()
    await expect(barra(page)).toContainText('3 marcadas')
  })

  test('con la tarjeta enfocada, Espacio marca y Shift+Espacio extiende', async ({
    page,
  }) => {
    await abrirCuadernillo(page)

    await hoja(page, 1).focus()
    await page.keyboard.press('Space')
    await expect(barra(page)).toContainText('1 marcada')
    await expect(tick(page, 1)).toHaveAttribute('aria-pressed', 'true')

    await hoja(page, 4).focus()
    await page.keyboard.press('Shift+Space')
    await expect(barra(page)).toContainText('4 marcadas')

    // Escape lo deshace entero, como antes.
    await page.keyboard.press('Escape')
    await expect(barra(page)).toHaveCount(0)
  })

  test('«Guardar N hojas» descarga un PDF solo con las marcadas', async ({ page }) => {
    // El caso que disparó #404: elegir unas pocas hojas de un documento y
    // que el archivo tenga exactamente esas. Se cuenta el PDF descargado, no
    // lo que dice la interfaz.
    await abrirCuadernillo(page)
    await tick(page, 2).click()
    await hoja(page, 4).click({ modifiers: ['Shift'] })
    await expect(barra(page)).toContainText('3 marcadas')

    const descarga = page.waitForEvent('download', { timeout: 30_000 })
    await barra(page).getByRole('button', { name: 'Guardar 3 hojas' }).click()
    const archivo = await descarga
    const bytes = await streamToBuffer(await archivo.createReadStream())
    const exportado = await PDFDocument.load(bytes)
    expect(exportado.getPageCount()).toBe(3)
  })
})

test.describe('Imprenta · lo guardado vuelve desde Biblioteca', () => {
  test('un PDF guardado de Imprenta se envía a Imprenta desde Biblioteca', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('trama:splash-seen', '1')
    })
    await enableDemoMode(page, { world: 'notas' })
    await page.goto('/?world=notas&section=biblioteca')
    await expect(page.getByRole('heading', { name: 'Biblioteca', level: 2 })).toBeVisible(
      {
        timeout: 15_000,
      },
    )

    // El PDF guardado de Imprenta de la demo: antes de #426 no era servible y
    // la barra decía «Solo imágenes y PDFs se pueden enviar a Imprenta».
    await page
      .getByRole('checkbox', { name: 'Seleccionar Borges — Ficciones (anotado).pdf' })
      .click()
    const enviar = page.getByRole('button', { name: 'Enviar a Imprenta' })
    await expect(enviar).toHaveAttribute('aria-disabled', 'false')
    await enviar.click()

    await expect(page.getByRole('heading', { name: 'Imprenta' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByAltText('Página 1').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/archivo enviado a Imprenta/i)).toBeVisible()
  })
})
