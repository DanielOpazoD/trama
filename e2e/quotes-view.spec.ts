import { expect, test } from '@playwright/test'
import { emptyState, mockBackend } from './fixtures'

/**
 * QuotesView — navegación y chips de filtro por tipo de entidad.
 */

test('citas: navegar a Citas y ver el heading', async ({ page }) => {
  const state = emptyState()
  await mockBackend(page, state)
  await page.goto('/')

  await page
    .getByRole('button', { name: /^Citas/ })
    .first()
    .click()

  await expect(page.getByRole('heading', { name: 'Citas', level: 2 })).toBeVisible()
})

test('citas: chips de filtro por tipo aparecen con entidades de distintos tipos', async ({
  page,
}) => {
  const state = emptyState()

  // Dos entidades de tipos distintos, cada una con una cita.
  state.entities.push(
    {
      id: 'e-escritor',
      type: 'escritor',
      name: 'Jorge Luis Borges',
      year: 1899,
      description: null,
      essay: null,
      position_x: null,
      position_y: null,
      origin: { kind: 'manual' },
      spotify_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'e-filosofo',
      type: 'filosofo',
      name: 'Simone Weil',
      year: 1909,
      description: null,
      essay: null,
      position_x: null,
      position_y: null,
      origin: { kind: 'manual' },
      spotify_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  )
  state.quotes.push(
    {
      id: 'q-borges',
      entity_id: 'e-escritor',
      text: 'El tiempo bifurca perpetuamente hacia innumerables futuros.',
      source: 'El jardín de senderos que se bifurcan',
      context: null,
      user_reflection: null,
      ai_reflection: null,
      ai_reflection_provider: null,
      ai_reflection_model: null,
      ai_reflection_at: null,
      linked_quote_ids: [],
      origin: { kind: 'manual' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'q-weil',
      entity_id: 'e-filosofo',
      text: 'La atención es la forma más rara y pura de la generosidad.',
      source: null,
      context: null,
      user_reflection: null,
      ai_reflection: null,
      ai_reflection_provider: null,
      ai_reflection_model: null,
      ai_reflection_at: null,
      linked_quote_ids: [],
      origin: { kind: 'manual' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  )

  await mockBackend(page, state)
  await page.goto('/')

  await page
    .getByRole('button', { name: /^Citas/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Citas', level: 2 })).toBeVisible()

  // Los chips de filtro deben aparecer: "Todas", "escritor", "filósofo"
  const todaChip = page.getByRole('button', { name: /Todas/ })
  await expect(todaChip).toBeVisible()

  const escritorChip = page.getByRole('button', { name: /escritor/ })
  await expect(escritorChip).toBeVisible()

  const filosofoChip = page.getByRole('button', { name: /filósofo/ })
  await expect(filosofoChip).toBeVisible()

  // Al hacer click en el chip "escritor", se convierte en el activo.
  // Verificamos que el chip sigue siendo visible y clicleable (no desaparece).
  await escritorChip.click()
  await expect(escritorChip).toBeVisible()
})
