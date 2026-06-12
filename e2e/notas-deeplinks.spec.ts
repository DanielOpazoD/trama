import { expect, test, type Page } from '@playwright/test'
import { emptyState, enableDemoMode, mockBackend } from './fixtures'

async function setupNotasDeepLink(page: Page) {
  await mockBackend(page, emptyState())
  await enableDemoMode(page)
}

async function expectNotasSection(page: Page, label: string, heading: string) {
  await expect(
    page.getByRole('button', { name: /Mundo actual: Notas\. Cambiar de mundo/ }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: label }).first()).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
}

test.describe('mundo notas deep links', () => {
  test('abre Notas sin depender de localStorage y conserva el destino tras reload', async ({
    page,
  }) => {
    await setupNotasDeepLink(page)

    await page.goto('/?world=notas')
    await expectNotasSection(page, 'Inicio', 'Hoy')
    await expect(page).toHaveURL(/world=notas/)
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('trama:world')))
      .toBe('notas')

    await page.reload()
    await expectNotasSection(page, 'Inicio', 'Hoy')
  })

  test('abre Tareas y Prompts como secciones reales de Notas', async ({ page }) => {
    await setupNotasDeepLink(page)

    await page.goto('/?world=notas&section=tareas')
    await expectNotasSection(page, 'Tareas', 'Tareas')
    await page.reload()
    await expectNotasSection(page, 'Tareas', 'Tareas')

    await page.goto('/?world=notas&section=prompts')
    await expectNotasSection(page, 'Prompts', 'Prompts')
    await page.reload()
    await expectNotasSection(page, 'Prompts', 'Prompts')
  })

  test('abre Imprenta y Planillas como módulos separados', async ({ page }) => {
    await setupNotasDeepLink(page)

    await page.goto('/?world=notas&section=pdf')
    await expectNotasSection(page, 'Imprenta', 'Imprenta')
    await expect(page.getByText(/Trae un PDF o unas imágenes/)).toBeVisible()

    await page.goto('/?world=notas&section=planillas')
    await expectNotasSection(page, 'Planillas', 'Planillas')
    await expect(page.getByText(/Una planilla empieza con una hoja/)).toBeVisible()
  })

  test('world=trama fuerza el mundo principal aunque hubiera preferencia Notas', async ({
    page,
  }) => {
    await setupNotasDeepLink(page)
    await page.addInitScript(() => {
      window.localStorage.setItem('trama:world', 'notas')
    })

    await page.goto('/?world=trama')

    await expect(
      page.getByRole('button', { name: /Mundo actual: Trama\. Cambiar de mundo/ }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Mundo actual: Notas\. Cambiar de mundo/ }),
    ).toBeHidden()
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('trama:world')))
      .toBe('trama')
  })

  test('section inválida cae a Inicio sin romper la URL compartida', async ({ page }) => {
    await setupNotasDeepLink(page)

    await page.goto('/?world=notas&section=invalida')

    await expectNotasSection(page, 'Inicio', 'Hoy')
  })
})
