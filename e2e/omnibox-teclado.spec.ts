import { expect, test, type Page } from '@playwright/test'
import { emptyState, enableDemoMode, mockBackend } from './fixtures'

/**
 * La gramática y el teclado del buscador (⌘K), en demo y con un navegador de
 * verdad. Cada caso fue un fallo medido antes de este cambio: preguntar tumbaba
 * la app entera, Enter en «nombre de la consulta» abría un resultado sin guardar
 * y «/» en el grafo abría la paleta en vez de enfocar su buscador.
 */
const APP_ROTA = /La trama se rompió/

async function paleta(page: Page) {
  await page.keyboard.press('ControlOrMeta+k')
  const dialogo = page.getByRole('dialog', { name: 'Buscar' })
  await expect(dialogo).toBeVisible()
  return dialogo
}

test.describe('buscador: gramática y teclado', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      window.sessionStorage.setItem('trama:splash-seen', '1'),
    )
    await mockBackend(page, emptyState())
    await enableDemoMode(page)
    await page.goto('/')
  })

  test('«?» con Enter pregunta, y la app sigue en pie', async ({ page }) => {
    const dialogo = await paleta(page)
    await dialogo.getByPlaceholder('Buscar o preguntar…').fill('?borges')
    await expect(
      dialogo.getByText('pregunta en lenguaje natural', { exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(dialogo.getByRole('heading', { name: '«borges»' })).toBeVisible()
    await expect(page.getByText(APP_ROTA)).toHaveCount(0)
  })

  test('⌘Enter pregunta lo escrito sin elegir fila', async ({ page }) => {
    const dialogo = await paleta(page)
    await dialogo.getByPlaceholder('Buscar o preguntar…').fill('borges')
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(dialogo.getByRole('heading', { name: '«borges»' })).toBeVisible()
  })

  test('Enter justo después de escribir abre lo escrito, no la fila anterior', async ({
    page,
  }) => {
    const dialogo = await paleta(page)
    await dialogo.getByPlaceholder('Buscar o preguntar…').fill('momentos')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Momentos', level: 2 })).toBeVisible()
  })

  test('«>» deja solo comandos', async ({ page }) => {
    const dialogo = await paleta(page)
    await dialogo.getByPlaceholder('Buscar o preguntar…').fill('>nueva')
    await expect(dialogo.getByRole('button', { name: /Nueva entidad/ })).toBeVisible()
    await expect(
      dialogo.getByRole('button', { name: /Preguntar a tu trama/ }),
    ).toHaveCount(0)
  })

  test('Enter en «Nombre de la consulta» guarda y la paleta sigue abierta', async ({
    page,
  }) => {
    const dialogo = await paleta(page)
    await dialogo.getByPlaceholder('Buscar o preguntar…').fill('?borges')
    await page.keyboard.press('Enter')
    const nombre = dialogo.getByLabel('Nombre de la consulta')
    await nombre.fill('Todo sobre Borges')
    await nombre.press('Enter')
    await expect(page.getByText('Consulta guardada')).toBeVisible()
    await expect(nombre).toHaveValue('')
    await expect(dialogo).toBeVisible()
    await expect(page).not.toHaveURL(/entity=/)
  })

  test('«/» en el grafo enfoca su buscador y no abre la paleta', async ({ page }) => {
    await page
      .getByRole('button', { name: /^Grafo/ })
      .first()
      .click()
    const buscarNodo = page.getByPlaceholder(/buscar nodo/i)
    await expect(buscarNodo).toBeVisible()
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('/')
    await expect(buscarNodo).toBeFocused()
    await expect(page.getByRole('dialog', { name: 'Buscar' })).toHaveCount(0)
  })
})
