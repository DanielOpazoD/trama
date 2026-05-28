import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
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

test('a11y: HomeView (Inicio) sin violaciones', async ({ page }) => {
  const state = emptyState()
  state.entities.push(SAMPLE_ENTITY)
  state.quotes.push(SAMPLE_QUOTE)
  await skipSplash(page)
  await mockBackend(page, state)
  await page.goto('/')
  // ρ-canvas: el h2 del HomeView ya no es "Inicio" — ahora es la fecha
  // de hoy capitalizada ("Sábado, 24 de mayo"). Esperamos al primer
  // <h2> dentro de main, que es el del hero (estable independiente
  // del copy concreto).
  await page.locator('main h2').first().waitFor({ timeout: 10_000 })
  // Pausa breve para que cualquier transition-colors animado del sidebar
  // settlee — axe captura mid-animation puede dar falsos positivos.
  await page.waitForTimeout(400)

  // Scope: solo el contenido dinámico de la vista. El sidebar y topbar
  // son estructurales y se chequean en su propio test. Esto mantiene
  // los tests focused: si HomeView regresiona, falla acá; si el sidebar
  // regresiona, falla en su test específico.
  const results = await new AxeBuilder({ page })
    .include('main')
    .withTags(A11Y_TAGS)
    .analyze()

  // Si hay violaciones, las imprimimos antes de fallar — mucho más útil
  // que un "expected 0, got N".
  if (results.violations.length > 0) {
    console.log('Violaciones de accesibilidad en HomeView:')
    for (const v of results.violations) {
      console.log(`  - [${v.impact}] ${v.id}: ${v.help}`)
      for (const node of v.nodes.slice(0, 3)) {
        console.log(`      → ${node.html.slice(0, 120)}`)
      }
    }
  }
  expect(results.violations).toEqual([])
})

test('a11y: EntitiesView sin violaciones', async ({ page }) => {
  const state = emptyState()
  state.entities.push(SAMPLE_ENTITY)
  await skipSplash(page)
  await mockBackend(page, state)
  await page.goto('/')
  await page.getByRole('button', { name: /^Entidades/ }).click()
  await page
    .getByRole('heading', { name: 'Entidades', level: 2 })
    .waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)

  const results = await new AxeBuilder({ page })
    .include('main')
    .withTags(A11Y_TAGS)
    .analyze()
  if (results.violations.length > 0) {
    console.log('Violaciones en EntitiesView:')
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
