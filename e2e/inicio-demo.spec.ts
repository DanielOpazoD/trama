import { expect, test } from '@playwright/test'
import { enableDemoMode } from './fixtures'

/**
 * Inicio en modo prueba. Es la primera pantalla que ve cualquiera que abre la
 * demo, y mostraba «No se pudo cargar tu portada»: el router de demo no tenía
 * ruta para `/api/home`. Ningún e2e miraba Inicio en demo; este lo hace.
 */
test('Inicio en modo prueba muestra la portada, no el estado de error', async ({
  page,
}) => {
  await enableDemoMode(page, { world: 'trama' })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Inicio' }).first()).toBeVisible({
    timeout: 15_000,
  })
  // La cita del día es el contenido de la portada: si está, la portada cargó.
  await expect(page.getByText('una cita de tu trama')).toBeVisible({ timeout: 15_000 })
  // Deja que la portada termine de cargar antes de mirar.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByText('No se pudo cargar tu portada')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
})
