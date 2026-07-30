import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { emptyState, enableDemoMode, mockBackend } from './fixtures'

/**
 * Por qué esta suite es opt-in (y qué NO protege):
 *
 * Las capturas guardadas son de macOS. Playwright sufija cada snapshot con la
 * plataforma (`-chromium-darwin`), y el rasterizado de fuentes y el antialiasing
 * subpíxel difieren lo suficiente entre macOS y Linux como para que una única
 * baseline no sirva para ambos. Los jobs `lint`/`unit`/`e2e` del CI corren en
 * ubuntu-latest: allí Playwright buscaría `-chromium-linux`, que no existe, y
 * generaría una segunda baseline que nadie revisó. De ahí el doble candado
 * `PDF_STUDIO_VISUAL=1` + `darwin`.
 *
 * Dónde SÍ corre en CI: `.github/workflows/pdf-visual.yml` (macos-latest), en
 * los PR que tocan el editor y una vez por semana como red de seguridad.
 *
 * Consecuencia práctica: `npm test` no cubre estos píxeles. Si cambias la barra
 * del editor, refresca acá a propósito:
 *   npm run e2e:pdf-visual -- --update-snapshots       # sólo las que fallan
 *   npm run e2e:pdf-visual -- --update-snapshots=all   # también las obsoletas
 *                                                      # que aún pasan por poco
 *
 * Ese segundo modo importa porque `maxDiffPixelRatio` absorbe cambios reales sin
 * fallar, y el modo por defecto se niega a reescribir lo que “pasa”. Así vivió
 * seis semanas en main que #257 sumara «Firma y timbre» a la barra: la captura
 * de MacBook Air se comía el 87 % de su tolerancia y seguía verde, y sólo
 * reventó la de móvil, donde el diff se concentra en 330 px de ancho.
 *
 * Las cinco capturas de página/modal siguen mostrando la barra previa a #257 y
 * el tooltip cerrado que #295 abrió al enfocar: pasan de sobra (3–44 % de su
 * tolerancia) y se dejaron a propósito sin refrescar, para no bendecir de una
 * sentada estados que nadie revisó. Refréscalas cuando toques esas pantallas.
 */
const runVisual = process.env.PDF_STUDIO_VISUAL === '1' && process.platform === 'darwin'

async function makePdfBuffer(): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.addPage([612, 792])
  return Buffer.from(await pdf.save())
}

async function openPdfEditor(page: Page, viewport = { width: 1280, height: 800 }) {
  await mockBackend(page, emptyState())
  await page.setViewportSize(viewport)
  await enableDemoMode(page, { world: 'notas' })
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

async function chooseHighlightTool(page: Page) {
  // "Resaltar" ahora es un botón directo de la barra (antes vivía en "Más funciones").
  await page.getByRole('button', { name: 'Herramienta Resaltar', exact: true }).click()
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
      // 0.01 sobre 1086×45 daba 488 px de presupuesto: suficiente para que un
      // grupo entero apareciera o desapareciera de la barra sin poner rojo el
      // test (fue exactamente lo que pasó con #257, 427 px). 0.002 ≈ 97 px:
      // sigue absorbiendo ruido de antialiasing, no un cambio estructural.
      animations: 'disabled',
      maxDiffPixelRatio: 0.002,
    })
  })

  test('menú de texto queda delante y estable', async ({ page }) => {
    await openPdfEditor(page, { width: 1280, height: 800 })

    // El color se consolidó dentro del menú "Texto" (fuente, tamaño, color, etc.).
    const toolbar = page.getByRole('toolbar', {
      name: 'Barra de herramientas de edición del PDF',
    })
    const trigger = toolbar.getByRole('button', { name: 'Texto', exact: true })
    await expect(trigger).toBeVisible()
    await trigger.dispatchEvent('click')
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(page).toHaveScreenshot('pdf-studio-text-menu.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    })
  })

  test('menú de formas queda delante y estable', async ({ page }) => {
    await openPdfEditor(page, { width: 1280, height: 800 })

    const toolbar = page.getByRole('toolbar', {
      name: 'Barra de herramientas de edición del PDF',
    })
    const trigger = toolbar.getByRole('button', { name: 'Formas', exact: true })
    await expect(trigger).toBeVisible()
    await trigger.dispatchEvent('click')
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(page).toHaveScreenshot('pdf-studio-shapes-menu.png', {
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

  test('modal con selección múltiple agrupada', async ({ page }) => {
    await openPdfEditor(page, { width: 1280, height: 800 })

    const dialog = page.getByRole('dialog', { name: 'Editar página 1' })
    const pageImage = dialog.getByAltText('Página 1')
    const pageBox = await pageImage.boundingBox()
    expect(pageBox).not.toBeNull()
    if (!pageBox) return

    for (const left of [0.18, 0.34, 0.58]) {
      await chooseHighlightTool(page)
      await page.mouse.move(
        pageBox.x + pageBox.width * left,
        pageBox.y + pageBox.height * 0.28,
      )
      await page.mouse.down()
      await page.mouse.move(
        pageBox.x + pageBox.width * (left + 0.08),
        pageBox.y + pageBox.height * 0.34,
      )
      await page.mouse.up()
    }

    await page.getByRole('button', { name: 'Herramienta seleccionar' }).click()
    const highlights = page.locator('[title="Arrastra para mover"]')
    await highlights.nth(0).click()
    await highlights.nth(1).click({ modifiers: ['Meta'] })
    await highlights.nth(2).click({ modifiers: ['Meta'] })
    await page.getByRole('button', { name: 'Agrupar selección', exact: true }).click()

    await expect(dialog).toHaveScreenshot('pdf-studio-modal-grouped-selection.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.015,
    })
  })

  test('modal con zoom alto conserva toolbar e inspector', async ({ page }) => {
    await openPdfEditor(page, { width: 1280, height: 800 })

    await page.getByRole('button', { name: 'Agregar cuadro de texto' }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Zoom del documento: aumentar' }).click()
    await page.getByRole('button', { name: 'Zoom del documento: aumentar' }).click()

    const dialog = page.getByRole('dialog', { name: 'Editar página 1' })
    await expect(dialog).toHaveScreenshot('pdf-studio-modal-high-zoom.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.015,
    })
  })

  test('toolbar mobile conserva una sola fila operacional', async ({ page }) => {
    await openPdfEditor(page, { width: 390, height: 844 })

    await expect(
      page.getByRole('toolbar', { name: 'Barra de herramientas de edición del PDF' }),
    ).toHaveScreenshot('pdf-studio-toolbar-mobile.png', {
      // Mismo criterio que la captura de MacBook Air: 0.004 sobre 330×45 ≈ 59 px.
      animations: 'disabled',
      maxDiffPixelRatio: 0.004,
    })
  })
})
