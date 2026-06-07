import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { emptyState, mockBackend } from './fixtures'

const shortcutMod = process.platform === 'darwin' ? 'Meta' : 'Control'
const samplePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAXElEQVR4nO3QMQEAAAgDINc/9F1gCwQhMmt2ZgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8G4QAAY0JbgoAAAAASUVORK5CYII=',
  'base64',
)

async function makePdfBuffer(pageCount = 1): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < pageCount; i += 1) pdf.addPage([612, 792])
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
  await expect(page.getByRole('dialog')).toBeVisible()
}

async function chooseHighlightTool(page: Page) {
  await waitForEditableSheetReady(page)
  await page.getByRole('button', { name: 'Más funciones', exact: true }).click()
  await page
    .getByRole('menuitemradio', { name: 'Herramienta Resaltar' })
    .click({ force: true })
  await expect
    .poll(async () =>
      page
        .locator('[data-pdf-editor-sheet="0"]')
        .evaluate((el) => getComputedStyle(el).cursor),
    )
    .toBe('crosshair')
}

async function chooseRectangleTool(page: Page) {
  await waitForEditableSheetReady(page)
  await page.getByRole('button', { name: 'Formas' }).click()
  await page
    .getByRole('menuitemradio', { name: 'Herramienta Rectángulo' })
    .click({ force: true })
}

async function waitForEditableSheetReady(page: Page) {
  await page.locator('[data-pdf-editor-sheet="0"]').waitFor({ state: 'visible' })
  await expect
    .poll(async () => {
      const metrics = await visibleSheetAnchor(page)
      return metrics.sheetWidth
    })
    .toBeGreaterThan(200)
  await expect
    .poll(async () => {
      const metrics = await visibleSheetAnchor(page)
      return Math.abs(metrics.xRatio - 0.5)
    })
    .toBeLessThan(0.03)
}

async function visibleSheetAnchor(page: Page, pageIndex = 0) {
  return page.evaluate((index) => {
    const container = document.querySelector<HTMLElement>('[data-pdf-editor-scroll]')
    const sheet = document.querySelector<HTMLElement>(
      `[data-pdf-editor-sheet="${index}"]`,
    )
    if (!container || !sheet) throw new Error('No se encontró hoja editable')
    const containerRect = container.getBoundingClientRect()
    const sheetRect = sheet.getBoundingClientRect()
    const centerX = containerRect.left + container.clientWidth / 2
    const centerY = containerRect.top + container.clientHeight / 2
    return {
      xRatio:
        sheetRect.width <= container.clientWidth
          ? 0.5
          : (centerX - sheetRect.left) / sheetRect.width,
      yRatio:
        sheetRect.height <= container.clientHeight
          ? 0.5
          : (centerY - sheetRect.top) / sheetRect.height,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      scrollWidth: container.scrollWidth,
      clientWidth: container.clientWidth,
      sheetLeft: sheetRect.left,
      sheetWidth: sheetRect.width,
      centerX,
    }
  }, pageIndex)
}

async function expectZoomKeepsSheetCenter(page: Page) {
  await waitForEditableSheetReady(page)
  const before = await visibleSheetAnchor(page)
  await page.getByRole('button', { name: 'Zoom del documento: aumentar' }).click()
  await expect
    .poll(async () => {
      const after = await visibleSheetAnchor(page)
      return Math.abs(after.xRatio - before.xRatio)
    })
    .toBeLessThan(0.03)
  const after = await visibleSheetAnchor(page)
  // Vertical scroll can clamp near the top when the sheet crosses from fitting in
  // the viewport to requiring scroll, so keep this assertion focused on jumps.
  expect(Math.abs(after.yRatio - before.yRatio)).toBeLessThan(0.11)
}

async function expectSheetEdgesReachable(page: Page) {
  await waitForEditableSheetReady(page)
  const zoomInput = page.getByLabel('Porcentaje de zoom')
  await zoomInput.fill('100')
  await zoomInput.press('Enter')
  await expect(zoomInput).toHaveValue('100')
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const container = document.querySelector<HTMLElement>('[data-pdf-editor-scroll]')
        const sheet = document.querySelector<HTMLElement>('[data-pdf-editor-sheet="0"]')
        if (!container || !sheet) return Number.POSITIVE_INFINITY
        const containerRect = container.getBoundingClientRect()
        const sheetRect = sheet.getBoundingClientRect()
        const leftGap = sheetRect.left - containerRect.left
        const rightGap = containerRect.right - sheetRect.right
        const sheetBg = getComputedStyle(sheet).backgroundColor
        const containerBg = getComputedStyle(container).backgroundColor
        if (sheetBg !== 'rgba(0, 0, 0, 0)') return Number.POSITIVE_INFINITY
        if (containerBg === 'rgba(0, 0, 0, 0)' || containerBg === 'rgb(255, 255, 255)') {
          return Number.POSITIVE_INFINITY
        }
        return Math.min(leftGap, rightGap)
      }),
    )
    .toBeGreaterThan(12)
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const container = document.querySelector<HTMLElement>('[data-pdf-editor-scroll]')
        const sheet = document.querySelector<HTMLElement>('[data-pdf-editor-sheet="0"]')
        if (!container || !sheet) return Number.POSITIVE_INFINITY
        const containerRect = container.getBoundingClientRect()
        const sheetRect = sheet.getBoundingClientRect()
        return Number(
          sheetRect.left >= containerRect.left && sheetRect.right <= containerRect.right,
        )
      }),
    )
    .toBe(1)
}

async function setEditorZoomPercent(page: Page, value: number) {
  const zoomInput = page.getByLabel('Porcentaje de zoom')
  await zoomInput.fill(String(value))
  await zoomInput.press('Enter')
  await expect(zoomInput).toHaveValue(String(value))
}

async function sheetWidth(page: Page) {
  return page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>('[data-pdf-editor-sheet="0"]')
    if (!sheet) throw new Error('No se encontró hoja editable')
    return sheet.getBoundingClientRect().width
  })
}

async function openTemplateFillEditor(page: Page) {
  await mockBackend(page, emptyState())
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => {
    window.localStorage.setItem('trama-demo', '1')
    window.localStorage.setItem('trama:world', 'notas')
    window.localStorage.removeItem('trama-demo-store')
  })
  await page.goto('/?world=notas&section=planillas')
  await expect(page.getByRole('heading', { name: 'Planillas' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'qa-planilla.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(),
  })
  const thumb = page.getByAltText('Página 1')
  await expect(thumb).toBeVisible()
  await thumb.dblclick()
  await expect(page.getByRole('dialog', { name: 'Editar página 1' })).toBeVisible()
  await waitForEditableSheetReady(page)

  await page.getByRole('button', { name: 'Campos' }).click()
  await page.getByRole('menuitem', { name: 'Crear casillero de texto' }).click()
  await page
    .locator('[data-pdf-editor-sheet="0"]')
    .click({ position: { x: 220, y: 220 } })
  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  await page.getByRole('button', { name: 'Mostrar el panel' }).click()
  const workspacePanel = page.getByRole('complementary').filter({ hasText: 'Panel' })
  await workspacePanel.getByRole('button', { name: 'Guardar planilla' }).click()
  await page.getByPlaceholder('Nombre de la planilla').fill('Planilla zoom')
  await workspacePanel.getByRole('button', { name: 'Guardar planilla' }).click()
  await page.getByRole('button', { name: 'Rellenar planilla Planilla zoom' }).click()
  await expect(page.getByRole('dialog', { name: 'Rellenar planilla' })).toBeVisible()
}

test.describe('Imprenta · editor PDF', () => {
  test.describe.configure({ mode: 'serial' })

  test('no muestra vestigios de planillas en el editor general', async ({ page }) => {
    await openPdfEditor(page)

    await expect(page.getByRole('button', { name: 'Campos' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Guardar planilla' })).toBeHidden()
    await expect(page.getByText('Rellenar planilla')).toBeHidden()
    await expect(page.getByText('casillero especial')).toBeHidden()
  })

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

  test('mantiene el centro de la hoja al aplicar zoom en el editor general', async ({
    page,
  }) => {
    await openPdfEditor(page)

    await expectZoomKeepsSheetCenter(page)
  })

  test('muestra ambos bordes de la hoja sobre fondo gris al 100%', async ({ page }) => {
    await openPdfEditor(page)

    await expectSheetEdgesReachable(page)
  })

  test('mantiene proporcional el cambio de zoom entre 90% y 100%', async ({ page }) => {
    await openPdfEditor(page)
    await waitForEditableSheetReady(page)

    await setEditorZoomPercent(page, 90)
    const widthAt90 = await sheetWidth(page)
    await setEditorZoomPercent(page, 100)
    const widthAt100 = await sheetWidth(page)

    expect(widthAt100 / widthAt90).toBeGreaterThan(1.08)
    expect(widthAt100 / widthAt90).toBeLessThan(1.15)
  })

  test('mantiene el centro de la hoja al aplicar zoom al rellenar una planilla', async ({
    page,
  }) => {
    await openTemplateFillEditor(page)

    await expectZoomKeepsSheetCenter(page)
  })

  test('muestra las páginas del editor seguidas y navegables por scroll', async ({
    page,
  }) => {
    await mockBackend(page, emptyState())
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.addInitScript(() => {
      window.localStorage.setItem('trama-demo', '1')
      window.localStorage.setItem('trama:world', 'notas')
      window.localStorage.removeItem('trama-demo-store')
    })
    await page.goto('/?world=notas&section=pdf')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'qa-continuo.pdf',
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer(3),
    })

    await expect(page.getByAltText('Página 1')).toBeVisible()
    await expect(page.getByAltText('Página 3')).toBeVisible()
    await page.getByAltText('Página 1').dblclick()

    const editorDialog = page.getByRole('dialog')
    await expect(page.getByRole('dialog', { name: 'Editar página 1' })).toBeVisible()
    await expect(editorDialog.getByAltText('Página 1')).toBeVisible()
    await expect(editorDialog.getByAltText('Página 2')).toBeVisible()
    await expect(editorDialog.getByAltText('Página 3')).toBeVisible()

    const page2Before = await editorDialog.getByAltText('Página 2').boundingBox()
    expect(page2Before).not.toBeNull()
    await page.getByRole('button', { name: 'Página siguiente' }).click()
    await expect(page.getByRole('dialog', { name: 'Editar página 2' })).toBeVisible()
    if (!page2Before) return
    await expect
      .poll(async () => {
        const box = await editorDialog.getByAltText('Página 2').boundingBox()
        return box?.y ?? Number.POSITIVE_INFINITY
      })
      .toBeLessThan(page2Before.y - 100)
  })

  test('mantiene foco atrapado, visible y navegable dentro del editor', async ({
    page,
  }) => {
    await openPdfEditor(page)

    const dialog = page.getByRole('dialog', { name: 'Editar página 1' })
    await page.keyboard.press('Tab')
    await expect
      .poll(() => dialog.evaluate((root) => root.contains(document.activeElement)))
      .toBe(true)

    const selectButton = page.getByRole('button', { name: 'Herramienta seleccionar' })
    await selectButton.focus()
    await expect(selectButton).toHaveClass(/focus-visible:ring-2/)

    await page.getByRole('button', { name: 'Agregar cuadro de texto' }).click()
    await page.keyboard.press('Escape')
    const xField = page.getByRole('spinbutton', { name: 'X de selección (%)' })
    await xField.focus()
    await expect(xField).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('spinbutton', { name: 'Y de selección (%)' }),
    ).toBeFocused()

    for (let i = 0; i < 40; i += 1) await page.keyboard.press('Tab')
    await expect
      .poll(() => dialog.evaluate((root) => root.contains(document.activeElement)))
      .toBe(true)
  })

  test('permite redimensionar un resaltado arrastrando un handle', async ({ page }) => {
    await openPdfEditor(page)

    await chooseHighlightTool(page)

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
      name: 'Redimensionar resaltado desde esquina superior derecha',
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
      handleBox.y + handleBox.height / 2 - 60,
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

    await chooseRectangleTool(page)

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
      name: 'Redimensionar forma desde esquina superior derecha',
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
      handleBox.y + handleBox.height / 2 - 60,
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
      name: 'Redimensionar texto desde esquina superior derecha',
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
      handleBox.y + handleBox.height / 2 - 55,
    )
    await page.mouse.up()

    await expect
      .poll(async () => (await textBox.boundingBox())?.width ?? 0)
      .toBeGreaterThan(before.width + 20)
    await expect
      .poll(async () => (await textBox.boundingBox())?.height ?? 0)
      .toBeGreaterThan(before.height + 12)
    const afterFontSize = await textBox.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).fontSize),
    )

    expect(afterFontSize).toBeCloseTo(beforeFontSize, 1)
  })

  test('muestra inspector de selección con alinear y bloquear objeto', async ({
    page,
  }) => {
    await openPdfEditor(page)

    await page.getByRole('button', { name: 'Agregar cuadro de texto' }).click()
    const editor = page.getByRole('textbox', { name: 'Editar texto' })
    await expect(editor).toBeVisible()
    await editor.fill('Inspector QA')
    await page.keyboard.press('Enter')

    const textBox = page.getByTitle('Doble clic para editar · arrastra para mover')
    await expect(textBox).toBeVisible()
    await textBox.click()

    const inspector = page.getByRole('complementary', {
      name: 'Inspector de selección',
    })
    await expect(inspector).toBeVisible()

    const before = await textBox.boundingBox()
    expect(before).not.toBeNull()
    if (!before) return

    await inspector.getByRole('spinbutton', { name: 'X de selección (%)' }).fill('32')
    await inspector.getByRole('spinbutton', { name: 'Ancho de selección (%)' }).fill('34')
    const afterNumericEdit = await textBox.boundingBox()
    expect(afterNumericEdit).not.toBeNull()
    if (!afterNumericEdit) return
    expect(afterNumericEdit.x).toBeGreaterThan(before.x + 30)
    expect(afterNumericEdit.width).toBeGreaterThan(before.width + 20)

    await inspector.getByRole('button', { name: 'Alinear a la derecha' }).click()
    const afterAlign = await textBox.boundingBox()
    expect(afterAlign).not.toBeNull()
    if (!afterAlign) return
    expect(afterAlign.x).toBeGreaterThan(before.x + 80)

    await inspector.getByRole('button', { name: 'Bloquear selección' }).click()
    await expect(
      inspector.getByRole('button', { name: 'Desbloquear selección' }),
    ).toBeVisible()

    const start = {
      x: afterAlign.x + afterAlign.width / 2,
      y: afterAlign.y + afterAlign.height / 2,
    }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x - 100, start.y + 40)
    await page.mouse.up()

    const afterLockedDrag = await textBox.boundingBox()
    expect(afterLockedDrag).not.toBeNull()
    if (!afterLockedDrag) return
    expect(afterLockedDrag.x).toBeCloseTo(afterAlign.x, 0)
  })

  test('permite selección múltiple y distribución desde el inspector', async ({
    page,
  }) => {
    await openPdfEditor(page)

    const dialog = page.getByRole('dialog', { name: 'Editar página 1' })
    const drawHighlight = async (left: number, top: number, count: number) => {
      await chooseHighlightTool(page)
      const pageImage = dialog.getByAltText('Página 1')
      const pageBox = await pageImage.boundingBox()
      expect(pageBox).not.toBeNull()
      if (!pageBox) return
      await page.mouse.move(
        pageBox.x + pageBox.width * left,
        pageBox.y + pageBox.height * top,
      )
      await page.mouse.down()
      await page.mouse.move(
        pageBox.x + pageBox.width * (left + 0.08),
        pageBox.y + pageBox.height * (top + 0.055),
      )
      await page.mouse.up()
      await expect(page.locator('[title="Arrastra para mover"]')).toHaveCount(count)
    }

    await drawHighlight(0.22, 0.08, 1)
    await drawHighlight(0.3, 0.13, 2)
    await drawHighlight(0.52, 0.18, 3)

    await page.getByRole('button', { name: 'Herramienta seleccionar' }).click()
    const highlights = page.locator('[title="Arrastra para mover"]')
    await expect(highlights).toHaveCount(3)

    const before = await highlights.nth(1).boundingBox()
    expect(before).not.toBeNull()
    if (!before) return

    await highlights.nth(0).click()
    await highlights.nth(1).click({ modifiers: [shortcutMod] })
    await highlights.nth(2).click({ modifiers: [shortcutMod] })

    await expect(
      page.getByRole('button', { name: 'Distribuir horizontalmente' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Agrupar selección', exact: true }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Distribuir horizontalmente' }).click()

    const after = await highlights.nth(1).boundingBox()
    expect(after).not.toBeNull()
    if (!after) return
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(24)

    await page.getByRole('button', { name: 'Enviar atrás' }).click()
    await page.getByRole('button', { name: 'Traer al frente' }).click()
    await expect(
      page.getByRole('button', { name: 'Agrupar selección', exact: true }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Agrupar selección', exact: true }).click()
    await page.getByRole('button', { name: 'Desagrupar selección' }).click()
  })

  test('permite seleccionar varios objetos arrastrando un marco de selección', async ({
    page,
  }) => {
    await openPdfEditor(page)

    await chooseHighlightTool(page)

    const dialog = page.getByRole('dialog', { name: 'Editar página 1' })
    const pageImage = dialog.getByAltText('Página 1')
    const pageBox = await pageImage.boundingBox()
    expect(pageBox).not.toBeNull()
    if (!pageBox) return

    const drawHighlight = async (left: number, top: number) => {
      await chooseHighlightTool(page)
      await page.mouse.move(
        pageBox.x + pageBox.width * left,
        pageBox.y + pageBox.height * top,
      )
      await page.mouse.down()
      await page.mouse.move(
        pageBox.x + pageBox.width * (left + 0.08),
        pageBox.y + pageBox.height * (top + 0.055),
      )
      await page.mouse.up()
    }

    await drawHighlight(0.22, 0.08)
    await drawHighlight(0.34, 0.13)
    await drawHighlight(0.56, 0.18)

    await page.getByRole('button', { name: 'Herramienta seleccionar' }).click()
    await page.mouse.move(
      pageBox.x + pageBox.width * 0.2,
      pageBox.y + pageBox.height * 0.06,
    )
    await page.mouse.down()
    await expect(page.locator('[data-pdf-selection-marquee="true"]')).toBeVisible()
    await page.mouse.move(
      pageBox.x + pageBox.width * 0.5,
      pageBox.y + pageBox.height * 0.22,
    )
    await page.mouse.up()

    await expect(
      page.getByRole('button', { name: 'Agrupar selección', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Desagrupar selección' })).toBeVisible()
  })

  test('permite seleccionar varios objetos con lazo libre', async ({ page }) => {
    await openPdfEditor(page)

    await chooseHighlightTool(page)
    const dialog = page.getByRole('dialog', { name: 'Editar página 1' })
    const pageImage = dialog.getByAltText('Página 1')
    const pageBox = await pageImage.boundingBox()
    expect(pageBox).not.toBeNull()
    if (!pageBox) return

    const drawHighlight = async (left: number, top: number) => {
      await chooseHighlightTool(page)
      await page.mouse.move(
        pageBox.x + pageBox.width * left,
        pageBox.y + pageBox.height * top,
      )
      await page.mouse.down()
      await page.mouse.move(
        pageBox.x + pageBox.width * (left + 0.07),
        pageBox.y + pageBox.height * (top + 0.05),
      )
      await page.mouse.up()
    }

    await drawHighlight(0.22, 0.08)
    await drawHighlight(0.36, 0.13)
    await drawHighlight(0.56, 0.18)

    await page.getByRole('button', { name: 'Herramienta seleccionar' }).click()
    await page.keyboard.down('Alt')
    await page.mouse.move(
      pageBox.x + pageBox.width * 0.2,
      pageBox.y + pageBox.height * 0.06,
    )
    await page.mouse.down()
    await page.mouse.move(
      pageBox.x + pageBox.width * 0.5,
      pageBox.y + pageBox.height * 0.06,
    )
    await expect(page.locator('[data-pdf-selection-lasso="true"]')).toBeVisible()
    await page.mouse.move(
      pageBox.x + pageBox.width * 0.52,
      pageBox.y + pageBox.height * 0.22,
    )
    await page.mouse.move(
      pageBox.x + pageBox.width * 0.2,
      pageBox.y + pageBox.height * 0.22,
    )
    await page.mouse.move(
      pageBox.x + pageBox.width * 0.2,
      pageBox.y + pageBox.height * 0.06,
    )
    await page.mouse.up()
    await page.keyboard.up('Alt')

    await expect(
      page.getByRole('button', { name: 'Agrupar selección', exact: true }),
    ).toBeVisible()
  })

  test('permite duplicar un cuadro de texto', async ({ page }) => {
    await openPdfEditor(page)

    await page.getByRole('button', { name: 'Agregar cuadro de texto' }).click()
    const editor = page.getByRole('textbox', { name: 'Editar texto' })
    await expect(editor).toBeVisible()
    await editor.fill('Texto snap')
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog', { name: 'Editar página 1' })
    const textBoxes = dialog.getByText('Texto snap', { exact: true })
    await expect(textBoxes).toHaveCount(1)

    await page.getByTitle('Doble clic para editar · arrastra para mover').click()
    await page.getByRole('button', { name: 'Duplicar texto' }).click()

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
      name: 'Redimensionar imagen desde esquina superior izquierda',
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
      handleBox.x + handleBox.width / 2 - 80,
      handleBox.y + handleBox.height / 2 - 60,
    )
    await page.mouse.up()

    await expect
      .poll(async () => (await stamp.boundingBox())?.width ?? 0)
      .toBeGreaterThan(before.width + 20)
    await expect
      .poll(async () => (await stamp.boundingBox())?.height ?? 0)
      .toBeGreaterThan(before.height + 12)
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
      name: 'Redimensionar imagen desde esquina superior izquierda',
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
      handleBox.x + handleBox.width / 2 - 130,
      handleBox.y + handleBox.height / 2 - 10,
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
