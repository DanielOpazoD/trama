import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { emptyState, mockBackend } from './fixtures'

const shortcutMod = process.platform === 'darwin' ? 'Meta' : 'Control'
const samplePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAXElEQVR4nO3QMQEAAAgDINc/9F1gCwQhMmt2ZgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8G4QAAY0JbgoAAAAASUVORK5CYII=',
  'base64',
)

async function makePdfBuffer(): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.addPage([612, 792])
  return Buffer.from(await pdf.save())
}

async function openPdfEditor(page: Page) {
  await mockBackend(page, emptyState())
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => {
    window.localStorage.setItem('trama-demo', '1')
    window.localStorage.setItem('trama:world', 'notas')
    window.localStorage.removeItem('trama-demo-store')
  })
  await page.goto('/?world=notas&section=pdf')
  await expect(page.getByRole('heading', { name: 'Imprenta' })).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles({
    name: 'qa-editor.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(),
  })

  const thumb = page.getByAltText('Página 1')
  await expect(thumb).toBeVisible()
  await thumb.dblclick()
  await expect(page.getByRole('dialog', { name: 'Editar página 1' })).toBeVisible()
}

async function toolbarMetrics(page: Page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>(
      '[role="toolbar"][aria-label="Barra de herramientas de edición del PDF"]',
    )
    if (!toolbar) throw new Error('No se encontró la toolbar del editor PDF')
    const children = Array.from(toolbar.children).map((child) => {
      const rect = child.getBoundingClientRect()
      return {
        top: rect.top,
        bottom: rect.bottom,
        centerY: rect.top + rect.height / 2,
      }
    })
    const centers = children.map((child) => child.centerY)
    return {
      className: toolbar.className,
      height: toolbar.getBoundingClientRect().height,
      scrollWidth: toolbar.scrollWidth,
      clientWidth: toolbar.clientWidth,
      centerRange: Math.max(...centers) - Math.min(...centers),
      maxChildBottom: Math.max(...children.map((child) => child.bottom)),
      minChildTop: Math.min(...children.map((child) => child.top)),
      bodyOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
}

async function expectMenuInFront(page: Page, triggerName: string) {
  await page.getByRole('button', { name: triggerName, exact: true }).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()

  const layer = await menu.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const probeX = Math.round(rect.left + rect.width / 2)
    const probeY = Math.round(rect.top + Math.min(24, rect.height / 2))
    const top = document.elementFromPoint(probeX, probeY)
    return {
      className: el.className,
      zIndex: getComputedStyle(el).zIndex,
      topRole: top?.getAttribute('role') ?? null,
      menuContainsTop: top ? el.contains(top) || el === top : false,
    }
  })

  expect(layer.className).toContain('z-[80]')
  expect(Number(layer.zIndex)).toBeGreaterThan(60)
  expect(layer.menuContainsTop).toBe(true)

  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
}

test.describe('Imprenta · editor PDF', () => {
  test.describe.configure({ mode: 'serial' })

  test('mantiene toolbar compacta y todos los menús delante del modal', async ({
    page,
  }) => {
    await openPdfEditor(page)

    const metrics = await toolbarMetrics(page)
    expect(metrics.className).toContain('flex-nowrap')
    expect(metrics.className).not.toContain('flex-wrap')
    expect(metrics.height).toBeLessThanOrEqual(48)
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
    expect(metrics.centerRange).toBeLessThanOrEqual(1)
    expect(metrics.maxChildBottom - metrics.minChildTop).toBeLessThanOrEqual(36)
    expect(metrics.bodyOverflow).toBeLessThanOrEqual(1)

    await expectMenuInFront(page, 'Fuente')
    await expectMenuInFront(page, 'Formas')
    await expectMenuInFront(page, 'Color')
    await expectMenuInFront(page, 'Más funciones')
  })

  test('permite redimensionar un resaltado arrastrando un handle', async ({ page }) => {
    await openPdfEditor(page)

    await page.getByRole('button', { name: 'Herramienta resaltar' }).click()

    const dialog = page.getByRole('dialog', { name: 'Editar página 1' })
    const pageImage = dialog.getByAltText('Página 1')
    const pageBox = await pageImage.boundingBox()
    expect(pageBox).not.toBeNull()
    if (!pageBox) return

    await page.mouse.move(
      pageBox.x + pageBox.width * 0.28,
      pageBox.y + pageBox.height * 0.25,
    )
    await page.mouse.down()
    await page.mouse.move(
      pageBox.x + pageBox.width * 0.48,
      pageBox.y + pageBox.height * 0.38,
    )
    await page.mouse.up()

    await page.getByRole('button', { name: 'Herramienta seleccionar' }).click()

    const highlight = page.locator('[title="Arrastra para mover"]').first()
    await expect(highlight).toBeVisible()

    const before = await highlight.boundingBox()
    expect(before).not.toBeNull()
    if (!before) return

    const handle = page.getByRole('button', {
      name: 'Redimensionar resaltado desde esquina inferior derecha',
    })
    await expect(handle).toBeVisible()
    const handleBox = await handle.boundingBox()
    expect(handleBox).not.toBeNull()
    if (!handleBox) return

    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 + 90,
      handleBox.y + handleBox.height / 2 + 60,
    )
    await page.mouse.up()

    const after = await highlight.boundingBox()
    expect(after).not.toBeNull()
    if (!after) return

    expect(after.width).toBeGreaterThan(before.width + 20)
    expect(after.height).toBeGreaterThan(before.height + 12)
  })

  test('permite redimensionar una forma vectorial arrastrando un handle', async ({
    page,
  }) => {
    await openPdfEditor(page)

    await page.getByRole('button', { name: 'Formas' }).click()
    await page.getByRole('menuitemradio', { name: 'Herramienta Rectángulo' }).click()

    const dialog = page.getByRole('dialog', { name: 'Editar página 1' })
    const pageImage = dialog.getByAltText('Página 1')
    const pageBox = await pageImage.boundingBox()
    expect(pageBox).not.toBeNull()
    if (!pageBox) return

    await page.mouse.move(
      pageBox.x + pageBox.width * 0.22,
      pageBox.y + pageBox.height * 0.22,
    )
    await page.mouse.down()
    await page.mouse.move(
      pageBox.x + pageBox.width * 0.42,
      pageBox.y + pageBox.height * 0.34,
    )
    await page.mouse.up()

    await page.getByRole('button', { name: 'Herramienta seleccionar' }).click()

    const shape = dialog.locator('svg[viewBox^="0 0"] rect[stroke="#222222"]').first()
    await expect(shape).toBeVisible()
    const before = await shape.evaluate((el) => ({
      width: Number(el.getAttribute('width')),
      height: Number(el.getAttribute('height')),
    }))

    const handle = page.getByRole('button', {
      name: 'Redimensionar forma desde esquina inferior derecha',
    })
    await expect(handle).toBeVisible()
    const handleBox = await handle.boundingBox()
    expect(handleBox).not.toBeNull()
    if (!handleBox) return

    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 + 80,
      handleBox.y + handleBox.height / 2 + 60,
    )
    await page.mouse.up()

    const after = await shape.evaluate((el) => ({
      width: Number(el.getAttribute('width')),
      height: Number(el.getAttribute('height')),
    }))

    expect(after.width).toBeGreaterThan(before.width + 20)
    expect(after.height).toBeGreaterThan(before.height + 12)
  })

  test('permite copiar, pegar y eliminar cuadros de texto con teclado', async ({
    page,
  }) => {
    await openPdfEditor(page)

    await page.getByRole('button', { name: 'Agregar cuadro de texto' }).click()
    const editor = page.getByRole('textbox', { name: 'Editar texto' })
    await expect(editor).toBeVisible()
    await editor.fill('Caja QA')
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog', { name: 'Editar página 1' })
    const textBoxes = dialog.getByText('Caja QA', { exact: true })
    await expect(textBoxes).toHaveCount(1)
    await textBoxes.first().click()

    await page.keyboard.press(`${shortcutMod}+C`)
    await page.keyboard.press(`${shortcutMod}+V`)
    await expect(textBoxes).toHaveCount(2)

    await page.keyboard.press('Delete')
    await expect(textBoxes).toHaveCount(1)
  })

  test('permite redimensionar una caja de texto sin cambiar la fuente', async ({
    page,
  }) => {
    await openPdfEditor(page)

    await page.getByRole('button', { name: 'Agregar cuadro de texto' }).click()
    const editor = page.getByRole('textbox', { name: 'Editar texto' })
    await expect(editor).toBeVisible()
    await editor.fill('Texto largo para medir caja')
    await page.keyboard.press('Enter')

    const textBox = page.getByTitle('Doble clic para editar · arrastra para mover')
    await expect(textBox).toBeVisible()
    await textBox.click()

    const before = await textBox.boundingBox()
    expect(before).not.toBeNull()
    if (!before) return
    const beforeFontSize = await textBox.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).fontSize),
    )

    const handle = page.getByRole('button', {
      name: 'Redimensionar texto desde esquina inferior derecha',
    })
    await expect(handle).toBeVisible()
    const handleBox = await handle.boundingBox()
    expect(handleBox).not.toBeNull()
    if (!handleBox) return

    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 + 90,
      handleBox.y + handleBox.height / 2 + 55,
    )
    await page.mouse.up()

    const after = await textBox.boundingBox()
    expect(after).not.toBeNull()
    if (!after) return
    const afterFontSize = await textBox.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).fontSize),
    )

    expect(after.width).toBeGreaterThan(before.width + 20)
    expect(after.height).toBeGreaterThan(before.height + 12)
    expect(afterFontSize).toBeCloseTo(beforeFontSize, 1)
  })

  test('permite duplicar arrastrando con Alt y muestra guías de snapping', async ({
    page,
  }) => {
    await openPdfEditor(page)

    await page.getByRole('button', { name: 'Agregar cuadro de texto' }).click()
    const editor = page.getByRole('textbox', { name: 'Editar texto' })
    await expect(editor).toBeVisible()
    await editor.fill('Texto snap')
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog', { name: 'Editar página 1' })
    const textBoxes = dialog.getByText('Texto snap', { exact: true })
    await expect(textBoxes).toHaveCount(1)

    const textBox = page.getByTitle('Doble clic para editar · arrastra para mover')
    const textBoxBounds = await textBox.boundingBox()
    expect(textBoxBounds).not.toBeNull()
    if (!textBoxBounds) return

    const pageImage = dialog.getByAltText('Página 1')
    const pageBounds = await pageImage.boundingBox()
    expect(pageBounds).not.toBeNull()
    if (!pageBounds) return

    const start = {
      x: textBoxBounds.x + textBoxBounds.width / 2,
      y: textBoxBounds.y + textBoxBounds.height / 2,
    }
    const target = {
      x: pageBounds.x + pageBounds.width / 2,
      y: start.y,
    }

    await page.keyboard.down('Alt')
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(target.x, target.y, { steps: 6 })
    await expect(dialog.locator('[data-pdf-snap-guide="x"]')).toBeVisible()
    await page.mouse.up()
    await page.keyboard.up('Alt')

    await expect(textBoxes).toHaveCount(2)
  })

  test('permite insertar y redimensionar una imagen estampada', async ({ page }) => {
    await openPdfEditor(page)

    await page.getByRole('button', { name: 'Estampar imagen' }).click()
    await page.locator('input[accept="image/png,image/jpeg"]').setInputFiles({
      name: 'sello-qa.png',
      mimeType: 'image/png',
      buffer: samplePng,
    })

    const stamp = page.getByRole('img', { name: 'Imagen estampada' })
    await expect(stamp).toBeVisible()
    await stamp.click()

    const before = await stamp.boundingBox()
    expect(before).not.toBeNull()
    if (!before) return

    const handle = page.getByRole('button', {
      name: 'Redimensionar imagen desde esquina inferior derecha',
    })
    await expect(handle).toBeVisible()
    const handleBox = await handle.boundingBox()
    expect(handleBox).not.toBeNull()
    if (!handleBox) return

    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 + 80,
      handleBox.y + handleBox.height / 2 + 60,
    )
    await page.mouse.up()

    const after = await stamp.boundingBox()
    expect(after).not.toBeNull()
    if (!after) return

    expect(after.width).toBeGreaterThan(before.width + 20)
    expect(after.height).toBeGreaterThan(before.height + 12)
  })

  test('mantiene proporción de imagen estampada al redimensionar con Shift', async ({
    page,
  }) => {
    await openPdfEditor(page)

    await page.getByRole('button', { name: 'Estampar imagen' }).click()
    await page.locator('input[accept="image/png,image/jpeg"]').setInputFiles({
      name: 'sello-qa.png',
      mimeType: 'image/png',
      buffer: samplePng,
    })

    const stamp = page.getByRole('img', { name: 'Imagen estampada' })
    await expect(stamp).toBeVisible()
    await stamp.click()

    const before = await stamp.boundingBox()
    expect(before).not.toBeNull()
    if (!before) return
    const beforeAspect = before.width / before.height

    const handle = page.getByRole('button', {
      name: 'Redimensionar imagen desde esquina inferior derecha',
    })
    const handleBox = await handle.boundingBox()
    expect(handleBox).not.toBeNull()
    if (!handleBox) return

    await page.keyboard.down('Shift')
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 + 130,
      handleBox.y + handleBox.height / 2 + 10,
    )
    await page.mouse.up()
    await page.keyboard.up('Shift')

    const after = await stamp.boundingBox()
    expect(after).not.toBeNull()
    if (!after) return

    expect(after.width).toBeGreaterThan(before.width + 20)
    expect(after.width / after.height).toBeCloseTo(beforeAspect, 1)
  })
})
