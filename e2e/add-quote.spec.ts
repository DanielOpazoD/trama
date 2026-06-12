import { expect, test } from '@playwright/test'
import { emptyState, mockBackend } from './fixtures'

/**
 * Flujo: añadir una cita manualmente desde QuotesView.
 *
 * Verifica que el formulario aparece, se puede completar y al enviar,
 * la cita queda registrada en el estado del backend mock.
 */
test('añadir cita manualmente desde QuotesView', async ({ page }) => {
  const state = emptyState()

  // Una entidad es necesaria: el botón "Añadir" solo aparece cuando hay entidades.
  state.entities.push({
    id: 'e-borges',
    type: 'escritor',
    name: 'Borges',
    year: 1899,
    description: null,
    essay: null,
    position_x: null,
    position_y: null,
    origin: { kind: 'manual' },
    spotify_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  await mockBackend(page, state)
  await page.goto('/')

  // Navegar a Citas desde la sidebar.
  await page
    .getByRole('button', { name: /^Citas/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Citas', level: 2 })).toBeVisible({
    timeout: 10_000,
  })

  // Abrir el formulario — el botón "Añadir" en el header toggle.
  // Al click, ese botón pasa a "Cerrar" y aparece un segundo "Añadir" como
  // submit del form — mismo patrón que add-entity.spec.ts.
  await page.getByRole('button', { name: /^Añadir$/ }).click()

  // Seleccionar la entidad en el select.
  await page.selectOption('select', { label: 'Borges' })

  // Rellenar el texto de la cita.
  await page
    .getByPlaceholder('La cita', { exact: true })
    .fill('El tiempo es un río que me arrebata...')

  // Enviar — el toggle es ahora "Cerrar", el único "Añadir" visible es el submit.
  await page.getByRole('button', { name: /^Añadir$/ }).click()

  // El POST se simula en el fixture y debería pushear la cita al state.
  await expect.poll(() => state.quotes.length).toBe(1)
  expect(state.quotes[0]!.text).toBe('El tiempo es un río que me arrebata...')
  expect(state.quotes[0]!.entity_id).toBe('e-borges')
})
