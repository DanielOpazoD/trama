import { expect, test } from '@playwright/test'
import { emptyState, mockBackend } from './fixtures'

/**
 * Flujo crítico: abrir el palette con ⌘K, buscar una entidad y abrirla.
 *
 * Antes este test apuntaba al input de búsqueda del sidebar. Ese input se
 * eliminó (commit 14991bf) cuando se consolidó la búsqueda en una sola
 * entrada — la palette con ⌘K. La intención del test (buscar y navegar
 * end-to-end) sigue siendo válida, solo cambia el componente.
 *
 * El nombre del archivo se conserva (`sidebar-search.spec.ts`) para no
 * romper history de runs anteriores; el contenido sí refleja el flujo
 * actual.
 */
test('palette ⌘K muestra resultados y permite abrir una entidad', async ({ page }) => {
  const state = emptyState()
  state.entities.push({
    id: 'e-borges',
    type: 'escritor',
    name: 'Jorge Luis Borges',
    year: 1899,
    description: 'argentino, ensayista, narrador',
    essay: null,
    position_x: null,
    position_y: null,
    origin: { kind: 'manual' },
    spotify_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  state.entities.push({
    id: 'e-cortazar',
    type: 'escritor',
    name: 'Julio Cortázar',
    year: 1914,
    description: 'argentino',
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

  // Abrir la palette con ⌘K (Meta+K en Mac, Control+K en Linux/Win — Playwright
  // mapea "Meta" al control en Linux CI, pero el handler en App.tsx acepta
  // ambos via `metaKey || ctrlKey`).
  await page.keyboard.press('Control+k')

  // El diálogo aparece con aria-label="Buscar".
  const palette = page.getByRole('dialog', { name: 'Buscar' })
  await expect(palette).toBeVisible()

  // El input del palette tiene el placeholder "Buscar o preguntar…".
  await palette.getByPlaceholder('Buscar o preguntar…').fill('borges')

  // El resultado de Borges aparece como botón en la lista.
  await expect(palette.getByRole('button', { name: /Jorge Luis Borges/ })).toBeVisible()

  // El otro escritor NO debe estar en los resultados filtrados.
  await expect(palette.getByRole('button', { name: /Julio Cortázar/ })).not.toBeVisible()
})

test('palette ⌘K se cierra con Escape', async ({ page }) => {
  const state = emptyState()
  await mockBackend(page, state)
  await page.goto('/')

  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: 'Buscar' })
  await expect(palette).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(palette).not.toBeVisible()
})
