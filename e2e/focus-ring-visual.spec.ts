import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { emptyState, enableDemoMode, mockBackend } from './fixtures'

// Regresión VISUAL del sistema de anillos (foco + selección). Snapshots opt-in,
// solo en macOS con PDF_STUDIO_VISUAL=1 (mismo mecanismo que pdf-studio-visual):
// CI no los corre — son la red de seguridad local para que el anillo no solo
// EXISTA (eso lo cubre focus-ring.spec.ts) sino que SE VEA igual. Recortamos
// alrededor del control para que el diff sea sensible al anillo, no a la toolbar.
const runVisual = process.env.PDF_STUDIO_VISUAL === '1' && process.platform === 'darwin'

async function makePdfBuffer(): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.addPage([612, 792])
  return Buffer.from(await pdf.save())
}

async function openPdfEditor(page: Page) {
  await mockBackend(page, emptyState())
  await page.setViewportSize({ width: 1280, height: 800 })
  await enableDemoMode(page, { world: 'notas' })
  await page.goto('/?world=notas&section=pdf')
  await expect(page.getByRole('heading', { name: 'Imprenta' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'visual-focus.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(),
  })
  const thumb = page.getByAltText('Página 1')
  await expect(thumb).toBeVisible()
  await thumb.dblclick()
  await expect(page.getByRole('dialog', { name: 'Editar página 1' })).toBeVisible()
}

// Tabula hasta enfocar (por teclado, para disparar :focus-visible) el control con
// el aria-label dado. Devuelve true si lo alcanzó.
async function keyboardFocus(page: Page, label: string): Promise<boolean> {
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Tab')
    const hit = await page.evaluate(
      (l) => document.activeElement?.getAttribute('aria-label') === l,
      label,
    )
    if (hit) return true
  }
  return false
}

// Región recortada alrededor del control (+ margen) para que el anillo —que vive
// FUERA de la caja del elemento— entre completo y pese en el diff.
async function ringClip(page: Page, label: string) {
  const box = await page.getByRole('button', { name: label, exact: true }).boundingBox()
  if (!box) throw new Error(`sin boundingBox para ${label}`)
  const m = 8
  return {
    x: Math.round(box.x - m),
    y: Math.round(box.y - m),
    width: Math.round(box.width + m * 2),
    height: Math.round(box.height + m * 2),
  }
}

test.describe('Sistema de anillos · regresión visual', () => {
  test.skip(
    !runVisual,
    'Snapshots visuales opt-in: ejecutar en macOS con PDF_STUDIO_VISUAL=1.',
  )
  test.describe.configure({ mode: 'serial' })

  const TOOL = 'Herramienta seleccionar' // botón de toolbar que usa .focus-ring

  test('foco por teclado dibuja el anillo del token (claro)', async ({ page }) => {
    await openPdfEditor(page)
    expect(await keyboardFocus(page, TOOL)).toBe(true)
    await expect(page).toHaveScreenshot('focus-ring-claro.png', {
      clip: await ringClip(page, TOOL),
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    })
  })

  test('el anillo se adapta en modo oscuro', async ({ page }) => {
    await openPdfEditor(page)
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    expect(await keyboardFocus(page, TOOL)).toBe(true)
    await expect(page).toHaveScreenshot('focus-ring-oscuro.png', {
      clip: await ringClip(page, TOOL),
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    })
  })
})
