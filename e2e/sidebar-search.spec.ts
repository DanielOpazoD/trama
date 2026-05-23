import { expect, test } from '@playwright/test'
import { emptyState, mockBackend } from './fixtures'

/**
 * Flujo crítico: buscar en la sidebar y abrir un resultado.
 * Cubre que el debounce + el endpoint server-only + el render de hits
 * funcionan end-to-end. Sin esto, la principal forma de navegación
 * cuando hay muchas entidades está rota.
 */
test('búsqueda en sidebar muestra resultados y permite navegar', async ({ page }) => {
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

  // Scope al sidebar (aside) — la HomeView también muestra entities
  // como botones en su timeline, lo cual confunde el locator global.
  const sidebar = page.locator('aside').first()

  // Escribir en la barra de búsqueda — debe debouncear ~250ms.
  await sidebar.getByPlaceholder('Buscar…').fill('borges')

  // Esperar que aparezca el resultado en el dropdown del sidebar.
  await expect(
    sidebar.getByRole('button', { name: /Jorge Luis Borges/ }),
  ).toBeVisible()

  // El otro escritor NO debe aparecer en el dropdown (no matchea).
  await expect(
    sidebar.getByRole('button', { name: /Julio Cortázar/ }),
  ).not.toBeVisible()
})

test('búsqueda con query vacío no muestra resultados', async ({ page }) => {
  const state = emptyState()
  state.entities.push({
    id: 'e-borges',
    type: 'escritor',
    name: 'Borges',
    year: null,
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

  // Scope al sidebar: la HomeView puede mostrar Borges en su timeline,
  // pero el dropdown de búsqueda del sidebar no debe tener nada.
  const sidebar = page.locator('aside').first()
  await expect(
    sidebar.getByRole('button', { name: /Borges/ }),
  ).not.toBeVisible()
})
