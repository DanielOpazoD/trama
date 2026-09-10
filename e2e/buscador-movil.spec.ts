import { expect, test, type Page } from '@playwright/test'
import { emptyState, enableDemoMode, mockBackend } from './fixtures'

/**
 * El buscador en móvil. Medido antes, a 390×844: Trama no tenía ningún
 * disparador del buscador (sin teclado físico, la paleta quedaba inaccesible) y
 * Notas abría otro diálogo.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

async function entrar(page: Page, world: 'trama' | 'notas', ruta: string) {
  await page.addInitScript(() => window.sessionStorage.setItem('trama:splash-seen', '1'))
  await mockBackend(page, emptyState())
  await enableDemoMode(page, { world })
  await page.goto(ruta)
}

test('en Trama, «Buscar» abre el buscador sin desbordar la pantalla', async ({
  page,
}) => {
  await entrar(page, 'trama', '/')
  await page.getByRole('button', { name: 'Buscar', exact: true }).tap({ timeout: 15_000 })
  const dialogo = page.getByRole('dialog', { name: 'Buscar', exact: true })
  await expect(dialogo).toBeVisible()
  await expect(dialogo.getByPlaceholder('Buscar o preguntar…')).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})

test('en Notas, «Buscar» abre el mismo buscador', async ({ page }) => {
  await entrar(page, 'notas', '/?world=notas&section=inicio')
  await page.getByRole('button', { name: 'Buscar', exact: true }).tap({ timeout: 15_000 })
  await expect(page.getByRole('dialog', { name: 'Buscar', exact: true })).toBeVisible()
})
