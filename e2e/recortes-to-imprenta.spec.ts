import { expect, test, type Page, type Route } from '@playwright/test'
import { emptyState, mockBackend } from './fixtures'

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
)

function jsonResp(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function setupRecorteImage(page: Page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('trama:splash-seen', '1')
  })
  await mockBackend(page, emptyState())

  const recorte = {
    id: 'r-img-1',
    text: 'Foto enviada por WhatsApp',
    source_url: null,
    source_title: 'Recibo WhatsApp',
    source_author: null,
    note: null,
    image_url: null,
    image_key: 'user-1/whatsapp-recibo.png',
    images: [{ storage_key: 'user-1/whatsapp-recibo.png' }],
    capture_mode: 'image',
    status: 'pending',
    promoted_target: null,
    promoted_id: null,
    source: 'whatsapp',
    captured_at: '2026-06-17T12:00:00.000Z',
    created_at: '2026-06-17T12:00:00.000Z',
    updated_at: '2026-06-17T12:00:00.000Z',
  }

  await page.route(
    (url) => url.pathname === '/api/notas-feed',
    (route) =>
      jsonResp(route, {
        items: [
          {
            type: 'recorte',
            id: recorte.id,
            createdAt: recorte.created_at,
            recorte,
          },
        ],
        nextCursor: null,
      }),
  )

  await page.route(
    (url) => url.pathname === '/api/recortes-image/user-1/whatsapp-recibo.png',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: ONE_PIXEL_PNG,
      }),
  )
}

test.describe('Recortes → Imprenta', () => {
  test('envía una imagen a Imprenta desde el menú del recorte', async ({ page }) => {
    await setupRecorteImage(page)
    await page.goto('/?world=notas&section=notas&segment=capturas')

    await expect(
      page.getByTestId('notas-world-content').getByRole('heading', { name: 'Notas' }),
    ).toBeVisible()
    await expect(page.getByText('Recibo WhatsApp')).toBeVisible()
    await page.getByRole('button', { name: 'Acciones del recorte' }).first().click()
    await page.getByRole('menuitem', { name: /Imprenta/i }).click()

    await expect(page.getByRole('heading', { name: 'Imprenta' })).toBeVisible()
    await expect(page.getByAltText('Página 1').first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText(/imagen enviada a Imprenta/i)).toBeVisible()
  })

  test('envía una imagen seleccionada a Imprenta y la importa como página', async ({
    page,
  }) => {
    await setupRecorteImage(page)
    await page.goto('/?world=notas&section=notas&segment=capturas')

    await expect(
      page.getByTestId('notas-world-content').getByRole('heading', { name: 'Notas' }),
    ).toBeVisible()
    await expect(page.getByText('Recibo WhatsApp')).toBeVisible()
    await page.getByRole('button', { name: 'seleccionar' }).click()
    await page
      .getByRole('checkbox', { name: /Seleccionar captura: Recibo WhatsApp/i })
      .click()
    await page
      .getByRole('toolbar', { name: 'Acciones de las capturas seleccionadas' })
      .getByRole('button', { name: /Imprenta/i })
      .click()

    await expect(page.getByRole('heading', { name: 'Imprenta' })).toBeVisible()
    await expect(page.getByAltText('Página 1').first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText(/imagen enviada a Imprenta/i)).toBeVisible()
  })
})
