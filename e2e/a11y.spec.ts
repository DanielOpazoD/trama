import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { NOTAS_SECTIONS, type NotasSection } from '../src/types/notas'
import { VIEW_MODES, type ViewMode } from '../src/types/view'
import { emptyState, mockBackend } from './fixtures'

/**
 * ε5: A11y gate — corre axe-core contra las vistas principales de Trama
 * y falla el CI si hay violaciones de WCAG A o AA.
 *
 * Antes detectábamos a11y issues solo cuando manualmente corríamos
 * Lighthouse (γ4 y δ8 vinieron de un audit manual). Ahora cualquier
 * regresión se detecta automáticamente en cada PR.
 *
 * Por qué axe-core en Playwright (vs Lighthouse-CI):
 *   - Reusa el dev server que ya levantamos para E2E (npm run dev).
 *   - Mismo runtime que el E2E suite, no agregamos infra nueva.
 *   - axe es lo que Lighthouse usa internamente para la categoría
 *     Accessibility — los hallazgos serían equivalentes.
 *   - Más rápido: ~1s por vista vs ~30s por audit Lighthouse.
 *
 * Tags filtradas: solo WCAG A/AA + best practice. NO incluimos
 * 'experimental' (rules en beta) ni 'AAA' (criterios estrictos que
 * pocas apps cumplen y que no son requeridos por ningún regulador).
 */

const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']

/**
 * Cada sección del mundo Notas, con cómo saber que terminó de montar.
 *
 * El gate cubría 5 superficies de 13, y dejaba fuera Imprenta y Planillas —las
 * dos con más controles del producto—. Peor que el hueco era que nada lo
 * señalaba: una sección nueva entraba sin prueba y nadie se enteraba. Por eso
 * la tabla se contrasta contra `NOTAS_SECTIONS` en el último test de este
 * archivo: si aparece una sección y no se lista acá, el CI lo dice.
 */
const SECCIONES_NOTAS: Record<
  NotasSection,
  { titulo: string; señal: (page: Page) => Locator }
> = {
  // `señal` NO puede ser el título de la sección: ese `<h1>` es cromo y lo pinta
  // el chrome de Notas antes de que resuelva el `Suspense`, así que esperarlo
  // deja a axe auditando el esqueleto de carga en vez de la sección. Medido:
  // en `pdf` y `planillas` el `h1` es el ÚNICO encabezado que existe, y en
  // `inicio` el encabezado de contenido dice «Hoy», no «Inicio».
  inicio: { titulo: 'Inicio', señal: (page) => page.locator('main h2').first() },
  notas: {
    titulo: 'Notas',
    señal: (page) => page.getByRole('heading', { name: 'Notas', level: 2 }),
  },
  tareas: {
    titulo: 'Tareas',
    señal: (page) => page.getByRole('heading', { name: 'Tareas', level: 2 }),
  },
  prompts: {
    titulo: 'Prompts',
    señal: (page) => page.getByRole('heading', { name: 'Prompts', level: 2 }),
  },
  claves: {
    titulo: 'Claves',
    señal: (page) => page.getByRole('heading', { name: 'Claves', level: 2 }),
  },
  // Imprenta y Planillas no tienen encabezado propio: su contenido empieza en
  // el lienzo de arrastre, que es lo único que prueba que montaron.
  pdf: { titulo: 'Imprenta', señal: (page) => page.getByText(/Trae un PDF/) },
  planillas: {
    titulo: 'Planillas',
    señal: (page) => page.getByText(/Una planilla empieza con una hoja/),
  },
  biblioteca: {
    titulo: 'Biblioteca',
    señal: (page) => page.getByRole('heading', { name: 'Biblioteca', level: 2 }),
  },
}

/**
 * Corre axe sobre `main` y falla nombrando cada violación con su nodo.
 * Antes comprueba que el esqueleto de `Suspense` ya no esté: auditar la
 * pantalla de carga da un verde que no dice nada de la sección.
 */
async function auditar(page: Page, dónde: string) {
  await expect(
    page.locator('main [role="status"]').filter({ hasText: 'Cargando' }),
  ).toHaveCount(0)
  const results = await new AxeBuilder({ page })
    .include('main')
    .withTags(A11Y_TAGS)
    .analyze()
  if (results.violations.length > 0) {
    console.log(`Violaciones en ${dónde}:`)
    for (const v of results.violations) {
      console.log(`  - [${v.impact}] ${v.id}: ${v.help}`)
      for (const node of v.nodes.slice(0, 3)) {
        console.log(`      → ${node.html.slice(0, 120)}`)
      }
    }
  }
  expect(results.violations, dónde).toEqual([])
}

/**
 * Skip el Splash en a11y tests. El splash es decorativo (aria-hidden) y
 * dura ~1.9s con animación de fade-out; durante esos frames el contraste
 * es bajo por diseño (la opacidad va de 0 a 1). axe lo flagea como
 * "color-contrast insufficient" sin entender que es transicional.
 *
 * sessionStorage 'trama:splash-seen' = ya no se muestra. Lo setteamos
 * via addInitScript ANTES de que el script de la app evalúe.
 */
async function skipSplash(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('trama:splash-seen', '1')
  })
}

// Para reusar entre tests, una entidad concreta con cita para tener
// data realista en las vistas que iteran sobre listas.
const SAMPLE_ENTITY = {
  id: 'e-test',
  type: 'escritor',
  name: 'Test Entity',
  year: 1900,
  description: 'descripción de prueba',
  essay: null,
  position_x: null,
  position_y: null,
  origin: { kind: 'manual' },
  spotify_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const SAMPLE_QUOTE = {
  id: 'q-test',
  entity_id: 'e-test',
  text: 'una cita de prueba para verificar a11y de quote rows',
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
}

const SAMPLE_RECORTE = {
  id: 'r-test',
  text: 'La memoria es un taller con luz propia.',
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
  captured_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

test('a11y: recorte en el feed de Notas sin violaciones', async ({ page }) => {
  await skipSplash(page)
  await mockBackend(page, emptyState())
  await page.route(
    (url) => url.pathname === '/api/recortes',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([SAMPLE_RECORTE]),
      }),
  )
  // El feed unificado se sirve por SQL (read-model); servimos el recorte como
  // ítem del feed para que la tarjeta se renderice en `?section=notas`.
  await page.route(
    (url) => url.pathname === '/api/notas-feed',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              type: 'recorte',
              id: SAMPLE_RECORTE.id,
              createdAt: SAMPLE_RECORTE.created_at,
              recorte: SAMPLE_RECORTE,
            },
          ],
          nextCursor: null,
        }),
      }),
  )
  await page.goto('/?world=notas&section=notas')
  await page
    .getByRole('heading', { name: 'Notas', level: 2 })
    .waitFor({ timeout: 10_000 })
  // El recorte pendiente se renderiza en el feed con su menú de acciones ⋯.
  await page
    .getByRole('button', { name: 'Acciones del recorte' })
    .first()
    .waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)

  const results = await new AxeBuilder({ page })
    .include('main')
    .withTags(A11Y_TAGS)
    .analyze()
  if (results.violations.length > 0) {
    console.log('Violaciones en el feed de Notas (recorte):')
    for (const v of results.violations) {
      console.log(`  - [${v.impact}] ${v.id}: ${v.help}`)
    }
  }
  expect(results.violations).toEqual([])
})

test('a11y: Settings Estado sin violaciones', async ({ page }) => {
  const state = emptyState()
  state.entities.push(SAMPLE_ENTITY)
  state.quotes.push(SAMPLE_QUOTE)
  await skipSplash(page)
  await mockBackend(page, state)
  await page.route(
    (url) => url.pathname === '/api/health',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          counts: { entities: 1, quotes: 1, relationships: 0 },
          month: { calls: 4, tokensIn: 1200, tokensOut: 420, costCents: 95 },
          budget: { limitCents: 5000, remainingCents: 4905, pct: 0.019 },
          auth: {
            clerkConfigured: true,
            legacyFallbackAllowed: false,
            legacyOwnerMapped: true,
            mode: 'clerk',
          },
          operational: {
            requestId: 'rid-a11y-health',
            databaseReachable: true,
            runtimeApiRoutesContract: 'check:runtime-api-routes',
            productionSmokeCommand: 'npm run smoke:production-report',
            legacyDataReassignmentCommand:
              'npm run legacy-data-reassignment:dry-run -- --markdown',
            logRedaction: 'structured-redaction',
          },
          status: 'ok',
          embeddings: { pendingEntities: 0, pendingQuotes: 0 },
          alerts: [],
          dailyCost: [{ day: '2026-06-13', costCents: 95, calls: 4 }],
          byProvider: [
            { provider: 'openai', model: 'gpt-test', calls: 4, costCents: 95 },
          ],
          recentErrors: [],
        }),
      }),
  )
  await page.goto('/')
  await page.locator('main h2').first().waitFor({ timeout: 10_000 })
  await page
    .getByRole('button', { name: /Configuración/ })
    .first()
    .click()
  await page.getByRole('dialog', { name: 'Configuración' }).waitFor()
  await page
    .getByRole('heading', { name: 'Estado del sistema' })
    .waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)

  const results = await new AxeBuilder({ page })
    .include('[role="dialog"][aria-label="Configuración"]')
    .withTags(A11Y_TAGS)
    .analyze()
  if (results.violations.length > 0) {
    console.log('Violaciones en Settings Estado:')
    for (const v of results.violations) {
      console.log(`  - [${v.impact}] ${v.id}: ${v.help}`)
    }
  }
  expect(results.violations).toEqual([])
})

test('a11y: palette ⌘K abierto sin violaciones', async ({ page }) => {
  const state = emptyState()
  state.entities.push(SAMPLE_ENTITY)
  await skipSplash(page)
  await mockBackend(page, state)
  await page.goto('/')
  // ρ-canvas: idem — esperamos al primer h2 de main, ya no por nombre.
  await page.locator('main h2').first().waitFor({ timeout: 10_000 })

  await page.keyboard.press('Control+k')
  await page.getByRole('dialog', { name: 'Buscar' }).waitFor()
  await page.waitForTimeout(400)

  // El palette es un dialog flotante — chequeamos solo el dialog mismo.
  const results = await new AxeBuilder({ page })
    .include('[role="dialog"][aria-label="Buscar"]')
    .withTags(A11Y_TAGS)
    .analyze()
  if (results.violations.length > 0) {
    console.log('Violaciones en palette:')
    for (const v of results.violations) {
      console.log(`  - [${v.impact}] ${v.id}: ${v.help}`)
    }
  }
  expect(results.violations).toEqual([])
})

// ─────────────────────────────────────────────────────────────────────────────
// Todas las secciones del mundo Notas, generadas desde la tabla.
//
// Reemplaza a los tests copiados uno por sección: eran el mismo bloque con el
// título cambiado, y esa forma es justo la que hace caro añadir la novena.
// ─────────────────────────────────────────────────────────────────────────────

for (const [section, { titulo, señal }] of Object.entries(SECCIONES_NOTAS) as [
  NotasSection,
  (typeof SECCIONES_NOTAS)[NotasSection],
][]) {
  test(`a11y: Notas · ${titulo} sin violaciones`, async ({ page }) => {
    await skipSplash(page)
    await mockBackend(page, emptyState())
    await page.goto(`/?world=notas&section=${section}`)
    // Espera a algo que SÓLO existe con la sección montada (ver la tabla).
    await señal(page).first().waitFor({ timeout: 15_000 })
    // Deja asentar las transiciones: axe a mitad de animación da falsos
    // positivos de contraste.
    await page.waitForTimeout(400)

    await auditar(page, `Notas · ${titulo}`)
  })
}

test('a11y: ninguna sección de Notas se queda sin auditar', async () => {
  // El ratchet. La lista viene de `NOTAS_SECTIONS`, que es lo que consume el
  // enrutador: una sección nueva aparece acá sola y este test la reclama antes
  // de que llegue a producción sin revisar.
  expect(Object.keys(SECCIONES_NOTAS).sort()).toEqual([...NOTAS_SECTIONS].sort())
})

// ─────────────────────────────────────────────────────────────────────────────
// Todas las vistas del mundo Trama, generadas desde la tabla, con su ratchet.
//
// Antes había cuatro tests copiados (Inicio, Entidades, Momentos, Atlas) y
// siete vistas sin auditar; Cronología, además, caía en el ErrorBoundary con el
// backend simulado y nadie lo veía. La tabla se contrasta contra `VIEW_MODES`.
// ─────────────────────────────────────────────────────────────────────────────

const VISTAS_TRAMA: Record<ViewMode, { titulo: string; señal: (page: Page) => Locator }> =
  {
    // El h2 del hero es la fecha de hoy, no «Inicio»: se espera al primer h2.
    inicio: { titulo: 'Inicio', señal: (page) => page.locator('main h2').first() },
    // El grafo no tiene encabezado de contenido: montó cuando aparece el
    // selector de lente de su cromo. `main button` a secas no sirve: el primer
    // botón de main es el conmutador de mundo, que en el runner de CI queda
    // fuera de vista y nunca se da por «visible».
    grafo: {
      titulo: 'Grafo',
      señal: (page) => page.getByRole('button', { name: 'por densidad' }),
    },
    entidades: {
      titulo: 'Entidades',
      señal: (page) => page.getByRole('heading', { name: 'Entidades', level: 2 }),
    },
    citas: {
      titulo: 'Citas',
      señal: (page) => page.getByRole('heading', { name: 'Citas', level: 2 }),
    },
    escuchas: {
      titulo: 'Escuchas',
      señal: (page) => page.getByRole('heading', { name: 'Escuchas', level: 2 }),
    },
    twitter: {
      titulo: 'Twitter',
      señal: (page) => page.getByRole('heading', { name: 'Twitter', level: 2 }),
    },
    momentos: {
      titulo: 'Momentos',
      señal: (page) => page.getByRole('heading', { name: 'Momentos', level: 2 }),
    },
    cronologia: {
      titulo: 'Cronología',
      señal: (page) => page.locator('main h2').first(),
    },
    atlas: {
      titulo: 'Atlas',
      señal: (page) => page.getByRole('heading', { name: 'Atlas', level: 2 }),
    },
    chat: {
      titulo: 'Chat',
      señal: (page) => page.getByRole('heading', { name: 'Hilo libre', level: 2 }),
    },
    sugerencias: {
      titulo: 'Sugerencias',
      señal: (page) => page.getByRole('heading', { name: 'Sugerencias', level: 2 }),
    },
  }

function estadoConDatos() {
  const state = emptyState()
  state.entities.push(SAMPLE_ENTITY)
  state.quotes.push(SAMPLE_QUOTE)
  return state
}

async function auditarVista(page: Page, view: ViewMode, dónde: string) {
  await skipSplash(page)
  await mockBackend(page, estadoConDatos())
  await page.goto(`/?view=${view}`)
  await VISTAS_TRAMA[view].señal(page).first().waitFor({ timeout: 15_000 })
  // La vista rota (ErrorBoundary) también tiene h2: hay que descartarla.
  await expect(page.getByText('Esta vista se rompió.')).toHaveCount(0)
  await page.waitForTimeout(400)
  await auditar(page, dónde)
}

for (const view of VIEW_MODES) {
  test(`a11y: Trama · ${VISTAS_TRAMA[view].titulo} sin violaciones`, async ({ page }) => {
    await auditarVista(page, view, `Trama · ${VISTAS_TRAMA[view].titulo}`)
  })
}

test('a11y: ninguna vista de Trama se queda sin auditar', async () => {
  expect(Object.keys(VISTAS_TRAMA).sort()).toEqual([...VIEW_MODES].sort())
})

// ─────────────────────────────────────────────────────────────────────────────
// Móvil. Todo lo anterior corría a un solo viewport de escritorio; los
// defectos de contraste y de tamaño de objetivo táctil son otros a 390 px.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('a11y en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  for (const view of VIEW_MODES) {
    test(`a11y móvil: Trama · ${VISTAS_TRAMA[view].titulo}`, async ({ page }) => {
      await auditarVista(page, view, `móvil · Trama · ${VISTAS_TRAMA[view].titulo}`)
    })
  }

  for (const [section, { titulo, señal }] of Object.entries(SECCIONES_NOTAS) as [
    NotasSection,
    (typeof SECCIONES_NOTAS)[NotasSection],
  ][]) {
    test(`a11y móvil: Notas · ${titulo}`, async ({ page }) => {
      await skipSplash(page)
      await mockBackend(page, emptyState())
      await page.goto(`/?world=notas&section=${section}`)
      await señal(page).first().waitFor({ timeout: 15_000 })
      await page.waitForTimeout(400)
      await auditar(page, `móvil · Notas · ${titulo}`)
    })
  }
})
