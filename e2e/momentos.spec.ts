import { expect, test } from '@playwright/test'
import { emptyState, enableDemoMode, mockBackend } from './fixtures'

/**
 * MomentosView — navegación y estado vacío.
 *
 * El endpoint /api/momentos no está en el fixture central (cae en el
 * catch-all que devuelve []), por lo que lo sobreescribimos aquí con
 * una respuesta paginada vacía correcta: { items: [], nextCursor: null }.
 */

async function setupMomentos(page: import('@playwright/test').Page) {
  const state = emptyState()
  await mockBackend(page, state)

  // Sobreescribir el catch-all para /api/momentos con la shape correcta.
  // Playwright matchea en orden inverso de registro, así que este handler
  // (registrado después de mockBackend) tiene prioridad sobre el catch-all.
  await page.route(
    (url) => url.pathname.startsWith('/api/momentos'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], nextCursor: null }),
      }),
  )

  return state
}

test('momentos: navegar a Momentos y ver el heading', async ({ page }) => {
  await setupMomentos(page)
  await page.goto('/')

  await page.getByRole('button', { name: 'Momentos' }).click()

  await expect(page.getByRole('heading', { name: 'Momentos', level: 2 })).toBeVisible()
})

test('momentos: estado vacío muestra mensaje "Todavía no hay momentos"', async ({
  page,
}) => {
  await setupMomentos(page)
  await page.goto('/')

  await page.getByRole('button', { name: 'Momentos' }).click()

  await expect(page.getByRole('heading', { name: 'Momentos', level: 2 })).toBeVisible()

  await expect(page.getByText('Todavía no hay momentos')).toBeVisible()
})

test('momentos: modo prueba muestra foto y nota de voz en timeline y album', async ({
  page,
}) => {
  await enableDemoMode(page)

  await page.goto('/?view=momentos')

  await expect(page.getByRole('heading', { name: 'Momentos', level: 2 })).toBeVisible()
  await expect(page.getByRole('button', { name: /tamaño: medio/i })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Cuaderno abierto' })).toBeVisible()
  await expect(page.getByText('1 foto')).toBeVisible()

  await page.getByRole('button', { name: 'Línea' }).click()

  await expect(page.getByRole('button', { name: 'Reproducir nota de voz' })).toBeVisible()
  await expect(page.getByText(/^0:0[01]$/)).toBeVisible()

  await page.getByRole('button', { name: 'Fotos' }).click()
  await page.getByRole('button', { name: 'Álbum' }).click()

  await expect(page.getByRole('img', { name: 'Cuaderno abierto' })).toBeVisible()
  await expect(page.getByText('1 foto')).toBeVisible()
})
