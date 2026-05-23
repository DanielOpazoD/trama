import { expect, test } from '@playwright/test'
import { emptyState, mockBackend } from './fixtures'

/**
 * Flujo crítico: crear una entidad manualmente desde EntitiesView.
 * Cubre el camino más básico de captura sin IA — el "todo lo demás puede
 * fallar pero esto tiene que funcionar".
 */
test('crear entidad manualmente desde EntitiesView', async ({ page }) => {
  const state = emptyState()
  await mockBackend(page, state)

  await page.goto('/')

  // Navegar a Entidades desde la sidebar.
  await page.getByRole('button', { name: 'Entidades' }).click()
  await expect(page.getByRole('heading', { name: 'Entidades' })).toBeVisible()

  // Abrir el formulario.
  await page.getByRole('button', { name: 'añadir manualmente' }).click()

  // Rellenar y enviar.
  await page.getByPlaceholder('Nombre').fill('Borges')
  await page.getByPlaceholder('Año').fill('1899')
  await page.getByPlaceholder('Nota o descripción (opcional)').fill('ensayista argentino')

  await page.getByRole('button', { name: /^Añadir$/ }).click()

  // El POST se simula en el fixture y debería pushear la entidad al state.
  await expect.poll(() => state.entities.length).toBe(1)
  expect(state.entities[0].name).toBe('Borges')
  expect(state.entities[0].year).toBe(1899)
  expect(state.entities[0].description).toBe('ensayista argentino')

  // El input se debe limpiar tras el submit exitoso.
  await expect(page.getByPlaceholder('Nombre')).toHaveValue('')
})
