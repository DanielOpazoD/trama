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
  // El TopBar muestra un h1 inmediatamente; esperamos el h2 de la vista lazy,
  // que en la suite completa puede tardar más que el timeout default.
  await expect(page.getByRole('heading', { name: 'Entidades', level: 2 })).toBeVisible({
    timeout: 10_000,
  })

  // Abrir el formulario — el botón del header toggle se llama "Añadir" (era
  // "añadir manualmente" antes de T4: UX copy minimal). Al click, ese botón
  // pasa a "Cerrar" y aparece un segundo botón "Añadir" como submit del form.
  // Por eso primer click usa el botón actual (único "Añadir") con regex anclado.
  await page.getByRole('button', { name: /^Añadir$/ }).click()

  // Rellenar y enviar. Una vez abierto el form, el header toggle muestra
  // "Cerrar" y el único "Añadir" restante es el submit del form.
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
