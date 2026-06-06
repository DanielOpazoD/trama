import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { emptyState, mockBackend } from './fixtures'

const runVisual = process.env.PDF_STUDIO_VISUAL === '1' && process.platform === 'darwin'

async function makePdfBuffer(): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.addPage([612, 792])
  return Buffer.from(await pdf.save())
}

async function openPdfEditor(page: Page, viewport = { width: 1280, height: 800 }) {
  await mockBackend(page, emptyState())
  await page.setViewportSize(viewport)
  await page.addInitScript(() => {
    window.localStorage.setItem('trama-demo', '1')
    window.localStorage.setItem('trama:world', 'notas')
    window.localStorage.removeItem('trama-demo-store')
  })
  await page.goto('/?world=notas&section=pdf')
  await expect(page.getByRole('heading', { name: 'Imprenta' })).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles({
    name: 'visual-editor.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(),
  })

  const thumb = page.getByAltText('Página 1')
  await expect(thumb).toBeVisible()
  await thumb.dblclick()
  await expect(page.getByRole('dialog', { name: 'Editar página 1' })).toBeVisible()
}

test.describe('Imprenta · PDF visual regression', () => {
  test.skip(
    !runVisual,
    'Snapshots visuales opt-in: ejecutar en macOS con PDF_STUDIO_VISUAL=1.',
  )
  test.describe.configure({ mode: 'serial' })

  test('toolbar compacta en MacBook Air', async ({ page }) => {
    await openPdfEditor(page, { width: 1280, height: 800 })

    await expect(
      page.getByRole('toolbar', { name: 'Barra de herramientas de edición del PDF' }),
    ).toHaveScreenshot('pdf-studio-toolbar-macbook-air.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    })
  })

  test('menú de color queda delante y estable', async ({ page }) => {
    await openPdfEditor(page, { width: 1280, height: 800 })

    await page.getByRole('button', { name: 'Color', exact: true }).click()
    await expect(page.getByRole('menu')).toHaveScreenshot('pdf-studio-color-menu.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    })
  })

  test('modal con selección, inspector y handles', async ({ page }) => {
    await openPdfEditor(page, { width: 1280, height: 800 })

    await page.getByRole('button', { name: 'Agregar cuadro de texto' }).click()
    await page.keyboard.press('Escape')

    const dialog = page.getByRole('dialog', { name: 'Editar página 1' })
    await expect(
      page.getByRole('complementary', { name: 'Inspector de selección' }),
    ).toBeVisible()
    await expect(dialog).toHaveScreenshot('pdf-studio-modal-selection.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.015,
    })
  })

  test('toolbar mobile conserva una sola fila operacional', async ({ page }) => {
    await openPdfEditor(page, { width: 390, height: 844 })

    await expect(
      page.getByRole('toolbar', { name: 'Barra de herramientas de edición del PDF' }),
    ).toHaveScreenshot('pdf-studio-toolbar-mobile.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.015,
    })
  })
})
