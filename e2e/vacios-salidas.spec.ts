import { expect, test, type Page } from '@playwright/test'
import { emptyState, mockBackend } from './fixtures'

/**
 * Las salidas de los vacíos del mundo Trama, recorridas con el cableado real:
 * App → ViewRouter → vista → shell (useAppModals → ShellOverlays → Settings).
 * Los tests unitarios lo prueban por partes y con mocks; este spec lo cose
 * entero. Sin modo demo: en demo X aparece conectada y la cronología tiene datos.
 */
async function sinSplash(page: Page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('trama:splash-seen', '1')
  })
}

test.describe('salidas de los vacíos del mundo Trama', () => {
  test.beforeEach(async ({ page }) => {
    await sinSplash(page)
    await mockBackend(page, emptyState())
  })

  test('X desconectada: «Conectar X» abre Configuración en su panel', async ({
    page,
  }) => {
    await page.route('**/api/x/status', (route) =>
      route.fulfill({ json: { connected: false } }),
    )
    await page.goto('/?view=twitter')

    await page.getByRole('button', { name: 'Conectar X' }).click()

    const configuracion = page.getByRole('dialog', { name: 'Configuración' })
    await expect(configuracion).toBeVisible()
    await expect(
      configuracion.getByRole('button', { name: /^X \(Twitter\)/ }),
    ).toHaveAttribute('aria-current', 'page')
  })

  test('Cronología vacía lleva a donde se crea lo que teje', async ({ page }) => {
    await page.goto('/?view=cronologia')

    await page.getByRole('button', { name: 'Guardar una cita' }).click()

    await expect(page.getByRole('heading', { name: 'Citas', level: 2 })).toBeVisible()
  })
})
