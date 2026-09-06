import { expect, test } from '@playwright/test'
import { emptyState, mockBackend } from './fixtures'

/**
 * El puente entre mundos: desde Momentos (mundo Trama), «Fotos a Imprenta»
 * cruza al mundo Notas con las fotos del momento ya cargadas como hojas.
 *
 * Es el único origen de imágenes que vivía fuera de Notas y no tenía camino a
 * Imprenta. El envío no puede pasar por props (NotasWorld no está montado) ni
 * por la URL (los File no se serializan): va por `imprentaHandoff`.
 *
 * Se usa el backend simulado y no la demo: las fotos de la demo son SVG, e
 * Imprenta compone hojas a partir de JPEG/PNG.
 */

// PNG de 1×1 válido (el más chico que pdf-lib acepta).
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

async function abrirMomentosConDosFotos(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('trama:splash-seen', '1')
  })
  const state = emptyState()
  const ahora = new Date().toISOString()
  state.momentos.push({
    id: 'm-fotos',
    kind: 'foto',
    captured_at: ahora,
    payload: {
      caption: 'Dos fotos del taller',
      items: [
        { storageKey: 'legacy-single-user/taller-1.png', width: 1, height: 1 },
        { storageKey: 'legacy-single-user/taller-2.png', width: 1, height: 1 },
      ],
    },
    note: null,
    origin: { kind: 'manual' },
    entity_ids: [],
    created_at: ahora,
    updated_at: ahora,
  })
  await mockBackend(page, state)
  await page.route(
    (url) => url.pathname.startsWith('/api/momentos-file/'),
    (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 }),
  )

  await page.goto('/?view=momentos')
  await expect(page.getByRole('heading', { name: 'Momentos', level: 2 })).toBeVisible({
    timeout: 15_000,
  })
}

async function esperarImprentaConDosHojas(page: import('@playwright/test').Page) {
  // Cruzó de mundo: Imprenta abierta y las dos fotos ya son hojas.
  await expect(page.getByRole('heading', { name: 'Imprenta' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByAltText('Página 1').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByAltText('Página 2').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/2 imágenes enviadas a Imprenta/)).toBeVisible()
}

test('desde la Línea de Momentos, «Fotos a Imprenta» abre Imprenta con las fotos del momento', async ({
  page,
}) => {
  await abrirMomentosConDosFotos(page)
  // Si la vista abre en Álbum, la acción vive en las entradas de la Línea.
  const linea = page.getByRole('button', { name: 'Línea' })
  if (await linea.count()) await linea.click()

  // El menú es hover-only: se abre por su botón accesible, que existe siempre.
  await page
    .getByRole('button', { name: 'Opciones del momento' })
    .first()
    .click({ force: true })
  await page.getByRole('menuitem', { name: 'Fotos a Imprenta' }).click()
  await esperarImprentaConDosHojas(page)
})

test('desde el Álbum de Momentos, la misma acción vive en «Opciones de foto»', async ({
  page,
}) => {
  await abrirMomentosConDosFotos(page)
  const album = page.getByRole('button', { name: 'Álbum' })
  if (await album.count()) await album.click()

  await page
    .getByRole('button', { name: 'Opciones de foto' })
    .first()
    .click({ force: true })
  await page.getByRole('menuitem', { name: 'Fotos a Imprenta' }).click()
  await esperarImprentaConDosHojas(page)
})
