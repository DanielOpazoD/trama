import { expect, test, type Page, type Route } from '@playwright/test'
import { emptyState, mockBackend } from './fixtures'

/**
 * Lazo de la captura unificada en el mundo Notas:
 *   pegar un enlace → recorte que se enriquece con metadatos OG →
 *   abrir el modal de promoción desde el menú ⋯ (→ momento).
 *
 * Backend mockeado con estado mutable en memoria: el create empuja el recorte,
 * el PATCH lo enriquece, promote/unpromote cambian su estado. Las rutas se
 * registran DESPUÉS de mockBackend para ganar (Playwright matchea en LIFO).
 */

type RecorteRow = {
  id: string
  text: string
  source_url: string | null
  source_title: string | null
  source_author: string | null
  note: string | null
  image_url: string | null
  image_key: string | null
  capture_mode: string | null
  status: string
  promoted_target: string | null
  promoted_id: string | null
  captured_at: string | null
  created_at: string
  updated_at: string
}

function jsonResp(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function setupCapture(page: Page) {
  const recortes: RecorteRow[] = []

  // Patrón de a11y.spec: API mockeada (sin modo demo, que usaría un store
  // local y se saltaría estos mocks). Saltamos el splash.
  await page.addInitScript(() => {
    window.sessionStorage.setItem('trama:splash-seen', '1')
  })
  await mockBackend(page, emptyState())

  // Metadatos OG del enlace (enriquecimiento diferido).
  await page.route(
    (url) => url.pathname === '/api/momentos-url-preview',
    (route) =>
      jsonResp(route, {
        url: 'https://example.com/x',
        title: 'Artículo de ejemplo',
        description: 'Un resumen del artículo',
        source: 'example.com',
        author: 'Autora Ejemplo',
        image: null,
        fetched: true,
      }),
  )

  // Colección de recortes + operaciones por id (create/list/patch/curar/deshacer).
  await page.route(
    (url) => url.pathname.startsWith('/api/recortes'),
    async (route) => {
      const req = route.request()
      const path = new URL(req.url()).pathname
      const method = req.method()
      const idMatch = path.match(/^\/api\/recortes\/([^/]+)/)
      const id = idMatch?.[1]
      const find = () => recortes.find((r) => r.id === id)

      if (method === 'POST' && path.endsWith('/suggest')) {
        return jsonResp(route, {
          target: 'momento',
          title: 'Momento sugerido',
          rationale: '',
          relatedEntityIds: [],
          suggestedEntityName: null,
          suggestedEntityType: null,
          relatedEntities: [],
        })
      }
      if (method === 'POST' && path.endsWith('/unpromote')) {
        const r = find()
        if (r) {
          r.status = 'pending'
          r.promoted_target = null
          r.promoted_id = null
        }
        return jsonResp(route, r)
      }
      if (method === 'POST' && path.endsWith('/promote')) {
        const r = find()
        if (r) {
          r.status = 'promoted'
          r.promoted_target = 'momento'
          r.promoted_id = 'm1'
        }
        return jsonResp(route, r)
      }
      if (method === 'PATCH' && id) {
        const body = JSON.parse(req.postData() || '{}')
        const r = find()
        if (r) {
          if (body.text) r.text = body.text
          if (body.sourceTitle != null) r.source_title = body.sourceTitle
          if (body.sourceAuthor != null) r.source_author = body.sourceAuthor
          if (body.imageUrl != null) r.image_url = body.imageUrl
        }
        return jsonResp(route, r)
      }
      if (method === 'POST' && path === '/api/recortes') {
        const body = JSON.parse(req.postData() || '{}')
        const row: RecorteRow = {
          id: 'r-1',
          text: body.text,
          source_url: body.sourceUrl ?? null,
          source_title: body.sourceTitle ?? null,
          source_author: null,
          note: null,
          image_url: null,
          image_key: null,
          capture_mode: body.captureMode ?? null,
          status: 'pending',
          promoted_target: null,
          promoted_id: null,
          captured_at: null,
          created_at: '2026-06-14T00:00:00.000Z',
          updated_at: '2026-06-14T00:00:00.000Z',
        }
        recortes.unshift(row)
        return jsonResp(route, row, 201)
      }
      // GET lista
      return jsonResp(route, recortes)
    },
  )

  // El feed unificado se sirve por SQL (read-model); acá lo reflejamos desde el
  // array mutable de recortes para que la tarjeta aparezca y muestre el título
  // ya enriquecido. Sembramos una nota previa para que la lista (virtualizada)
  // esté montada antes de crear — el caso real (un feed con contenido) y evita
  // la transición lista-vacía→1 ítem del virtualizer. Se registra después de
  // mockBackend → gana el match.
  const seedNote = {
    id: 'seed-note',
    content: 'Nota previa del feed',
    tags: [] as string[],
    pinned: false,
    promoted_momento_id: null,
    created_at: '2026-06-13T00:00:00.000Z',
    updated_at: '2026-06-13T00:00:00.000Z',
  }
  await page.route(
    (url) => url.pathname === '/api/notas-feed',
    (route) =>
      jsonResp(route, {
        items: [
          ...recortes.map((r) => ({
            type: 'recorte',
            id: r.id,
            createdAt: r.created_at,
            recorte: r,
          })),
          {
            type: 'note',
            id: seedNote.id,
            createdAt: seedNote.created_at,
            note: seedNote,
          },
        ],
        nextCursor: null,
      }),
  )
}

test.describe('captura unificada en Notas', () => {
  test('pega un enlace, lo enriquece y abre el modal de promoción desde el menú ⋯', async ({
    page,
  }) => {
    await setupCapture(page)
    await page.goto('/?world=notas&section=notas')

    // Pegar un enlace solo cambia el botón a «Guardar enlace».
    const composer = page.getByPlaceholder(/Escribe una nota/)
    await composer.fill('https://example.com/x')
    await page.getByRole('button', { name: 'Guardar enlace' }).click()

    // La tarjeta aparece y, tras el enriquecimiento OG (preview → PATCH →
    // refetch del feed), muestra el título. Damos margen al doble round-trip.
    await expect(page.getByText(/Artículo de ejemplo/).first()).toBeVisible({
      timeout: 15_000,
    })

    // La curaduría vive en el menú ⋯: «→ Momento» abre el modal de promoción.
    await page.getByRole('button', { name: 'Acciones del recorte' }).first().click()
    await page.getByRole('menuitem', { name: /→ Momento/ }).click()
    await expect(page.getByRole('dialog', { name: 'Promover a momento' })).toBeVisible()

    // Cerrar el modal (cancelar) deja el recorte presente; el enlace no se perdió.
    // (No usamos el botón «Cerrar» del backdrop: cubre toda la pantalla y el
    // diálogo intercepta el clic en su centro.)
    await page.getByRole('button', { name: 'cancelar' }).click()
    await expect(page.getByText(/Artículo de ejemplo/).first()).toBeVisible()
  })
})
