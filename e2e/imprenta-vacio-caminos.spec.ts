import { expect, test, type Page } from '@playwright/test'
import { emptyState, enableDemoMode, mockBackend } from './fixtures'

/**
 * El vacío de Imprenta enseña los caminos que ya llegan a ella. Este spec
 * recorre el cableado entero —NotasWorld → PdfStudioView → panel principal →
 * caminos— que los tests unitarios solo ven por partes.
 */
async function abrirImprenta(page: Page) {
  await page.goto('/?world=notas&section=pdf')
  await expect(page.getByText(/Trae un PDF o unas imágenes/)).toBeVisible()
}

async function expectSeccion(page: Page, label: string) {
  await expect(
    page.getByRole('button', { name: label, exact: true }).first(),
  ).toHaveAttribute('aria-current', 'page')
}

test.describe('vacío de Imprenta', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page, emptyState())
    await enableDemoMode(page)
  })

  test('lleva a la Biblioteca y a las notas', async ({ page }) => {
    await abrirImprenta(page)
    await page.getByRole('button', { name: 'Desde la Biblioteca' }).click()
    await expectSeccion(page, 'Biblioteca')

    await abrirImprenta(page)
    await page.getByRole('button', { name: 'Desde tus notas y capturas' }).click()
    await expectSeccion(page, 'Notas')
  })

  test('lleva a Planillas, y ahí el vacío no repite los caminos de Imprenta', async ({
    page,
  }) => {
    await abrirImprenta(page)
    await page.getByRole('button', { name: /una planilla/ }).click()
    await expectSeccion(page, 'Planillas')
    await expect(page.getByText(/Una planilla empieza con una hoja/)).toBeVisible()
    await expect(
      page.getByRole('group', { name: 'Otros caminos a Imprenta' }),
    ).toHaveCount(0)
  })
})
