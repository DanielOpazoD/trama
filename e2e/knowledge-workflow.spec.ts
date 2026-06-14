import { expect, test, type Page, type Route } from '@playwright/test'
import { emptyState, mockBackend } from './fixtures'

function jsonResp(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function skipSplash(page: Page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('trama:splash-seen', '1')
  })
}

async function installClipboardCapture(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          window.localStorage.setItem('trama:test-copied-markdown', text)
        },
      },
    })
  })
}

test('mesa editorial: convierte materiales pendientes en propuesta y Markdown', async ({
  page,
}) => {
  await skipSplash(page)
  await installClipboardCapture(page)
  await mockBackend(page, emptyState())

  await page.route(
    (url) => url.pathname === '/api/recortes',
    (route) =>
      jsonResp(route, [
        {
          id: 'r-workshop',
          text: 'La memoria es un taller con herramientas prestadas.',
          source_url: 'https://example.com/taller',
          source_title: 'El taller de la memoria',
          source_author: 'Otra Parte',
          note: 'conecta con Borges',
          image_url: null,
          image_key: null,
          capture_mode: 'citation',
          status: 'pending',
          promoted_target: null,
          promoted_id: null,
          captured_at: '2026-06-12T10:00:00Z',
          created_at: '2026-06-12T10:00:00Z',
          updated_at: '2026-06-12T10:00:00Z',
        },
      ]),
  )
  await page.route(
    (url) => url.pathname === '/api/proactive-suggestions',
    (route) =>
      jsonResp(route, [
        {
          id: 's-borges',
          kind: 'relationship',
          payload: {
            fromName: 'Borges',
            toName: 'Ficciones',
            type: 'resuena con',
            reason: 'Aparecen juntos en recortes recientes.',
          },
          status: 'pending',
          provider: 'openai',
          model: 'gpt-test',
          createdAt: '2026-06-12T11:00:00Z',
          statusChangedAt: null,
        },
      ]),
  )

  await page.goto('/?world=notas&section=bandeja')
  await page.getByRole('button', { name: 'Mesa' }).click()

  await expect(
    page.getByRole('heading', { name: 'Mesa editorial', level: 2 }),
  ).toBeVisible()
  await expect(page.getByText('Inbox de conocimiento')).toBeVisible()
  await expect(page.getByText('El taller de la memoria')).toBeVisible()
  await expect(page.getByText(/Relación sugerida: Borges/)).toBeVisible()

  const addButtons = page.getByRole('button', { name: /añadir a mesa/i })
  await expect(addButtons).toHaveCount(2)
  await addButtons.nth(0).click()
  await expect(addButtons).toHaveCount(1)
  await addButtons.nth(0).click()

  await expect(page.getByText('Propuesta narrativa')).toBeVisible()
  await expect(page.getByText('Tesis provisional')).toBeVisible()
  await expect(page.getByText('Huecos a revisar')).toBeVisible()

  await page.getByRole('button', { name: /copiar Markdown/i }).click()
  await expect(page.getByText('Markdown copiado')).toBeVisible()

  const copied = await page.evaluate(() =>
    window.localStorage.getItem('trama:test-copied-markdown'),
  )
  expect(copied).toContain('# Borrador desde Trama')
  expect(copied).toContain('El taller de la memoria')
})
