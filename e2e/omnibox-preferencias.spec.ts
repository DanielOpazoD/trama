import { expect, test, type Page } from '@playwright/test'
import { emptyState, mockBackend } from './fixtures'

/**
 * El buscador con las preferencias del servidor. Medido antes del arreglo, en
 * demo: con el alias «mapa» en Grafo, «#mapa» respondía «nada coincide» (#457
 * dejó a «#» solo con las secciones de Notas), y con Notas protegida por PIN,
 * «?comprar pan» enseñaba la nota que la sección pedía desbloquear.
 */
const NOTA = {
  kind: 'note',
  id: 'n-1',
  title: null,
  snippet: 'Acordarme de comprar pan y leche camino a casa.',
  createdAt: '2026-09-01T10:00:00.000Z',
  tags: [],
}
const ENTIDAD = {
  kind: 'entity',
  id: 'e-1',
  title: 'Panadería La Espiga',
  snippet: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  tags: [],
}

async function abrirPaleta(page: Page, prefs: object) {
  await page.addInitScript(() => window.sessionStorage.setItem('trama:splash-seen', '1'))
  await mockBackend(page, emptyState())
  await page.route(
    (url) => url.pathname === '/api/user-prefs',
    (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(prefs) }),
  )
  await page.route(
    (url) => url.pathname === '/api/query/nl',
    (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          items: [ENTIDAD, NOTA],
          nextCursor: null,
          query: {
            from: ['entity', 'note'],
            where: { op: 'matches', value: 'comprar pan' },
          },
          source: 'fallback',
        }),
      }),
  )
  await page.goto('/')
  await page.locator('main h2').first().waitFor({ timeout: 10_000 })
  await page.keyboard.press('ControlOrMeta+k')
  const dialogo = page.getByRole('dialog', { name: 'Buscar' })
  await expect(dialogo).toBeVisible()
  return dialogo
}

test('«#» encuentra una vista por su alias y Enter la abre', async ({ page }) => {
  const dialogo = await abrirPaleta(page, { sectionAliases: { grafo: 'mapa' } })
  await dialogo.getByPlaceholder('Buscar o preguntar…').fill('#mapa')
  await expect(dialogo.getByRole('button', { name: /^Grafo/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(dialogo).toHaveCount(0)
  await expect(
    page.locator('[aria-current="page"]').filter({ hasText: 'Grafo' }),
  ).toBeVisible()
})

test('una pregunta no enseña notas de una sección protegida con PIN', async ({
  page,
}) => {
  const dialogo = await abrirPaleta(page, { pinnedSections: { 'notas:notas': true } })
  await dialogo.getByPlaceholder('Buscar o preguntar…').fill('?comprar pan')
  await page.keyboard.press('Enter')
  await expect(dialogo.getByRole('heading', { name: '«comprar pan»' })).toBeVisible()
  await expect(dialogo.getByText('Panadería La Espiga')).toBeVisible()
  await expect(dialogo.getByText(/comprar pan y leche/)).toHaveCount(0)
})

test('sin PIN, la misma pregunta sí enseña la nota', async ({ page }) => {
  const dialogo = await abrirPaleta(page, {})
  await dialogo.getByPlaceholder('Buscar o preguntar…').fill('?comprar pan')
  await page.keyboard.press('Enter')
  await expect(dialogo.getByRole('heading', { name: '«comprar pan»' })).toBeVisible()
  await expect(dialogo.getByText(/comprar pan y leche/).first()).toBeVisible()
})
