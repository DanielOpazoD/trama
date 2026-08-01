import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { emptyState, enableDemoMode, mockBackend } from './fixtures'

/**
 * Las capturas del README, generadas desde el MODO PRUEBA.
 *
 * No son fotos que alguien sacó una vez y quedaron congeladas: se regeneran
 * con `npm run capturas`, contra la app de verdad y con los mismos datos
 * sembrados que ve cualquiera que abra el enlace `?demo=1`. Si una pantalla
 * cambia, la captura cambia con ella — un README con imágenes viejas miente
 * sobre el producto.
 *
 * Cada toma **espera contenido real y lo afirma** antes de disparar. El primer
 * intento de este fichero navegaba por `?section=…` y esperaba un temporizador:
 * salió un Inicio lleno de esqueletos de carga etiquetado como «grafo». Una
 * captura falsa en el README es peor que ninguna, así que aquí la espera es
 * siempre una aserción sobre algo que sólo existe si la pantalla cargó.
 *
 * Opt-in a propósito (`TRAMA_CAPTURAS=1`): escribe ficheros fuera de
 * `test-results/`, así que no debe correr en la suite normal de CI.
 */
const generar = process.env.TRAMA_CAPTURAS === '1'

const DESTINO = 'docs/images'
// Proporción ancha y sobria: el README las muestra a ~900px de ancho.
const VIEWPORT = { width: 1440, height: 900 }

async function abrirDemo(page: Page, mundo: 'trama' | 'notas') {
  await mockBackend(page, emptyState())
  await page.setViewportSize(VIEWPORT)
  await enableDemoMode(page, { world: mundo })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
}

/** La barra lateral es la navegación real de la app; `?section=` no lo es. */
async function irA(page: Page, seccion: string) {
  await page.getByRole('button', { name: seccion, exact: true }).click()
}

/** Deja pasar la entrada `animate-fade-up` (90–160ms) antes de retratar. */
async function reposar(page: Page) {
  await page.waitForTimeout(400)
}

test.describe('Capturas del README', () => {
  test.skip(!generar, 'Opt-in: TRAMA_CAPTURAS=1 npm run capturas')

  test.beforeAll(() => {
    mkdirSync(DESTINO, { recursive: true })
  })

  test('grafo', async ({ page }) => {
    await abrirDemo(page, 'trama')
    await irA(page, 'Grafo')

    // El grafo ha dibujado DE VERDAD. Un `svg circle` no sirve: lo cumple el
    // propio spinner de «hilando vista…», y la primera versión de esta toma
    // retrató la pantalla de carga. El lienzo cargado se anuncia con su
    // recuento, así que se espera a que exista y a que NO sea cero.
    const lienzo = page.getByRole('application', { name: /entidades/ })
    await expect(lienzo).toBeVisible({ timeout: 20_000 })
    const etiqueta = (await lienzo.getAttribute('aria-label')) ?? ''
    expect(Number(etiqueta.match(/(\d+) entidades/)?.[1] ?? 0)).toBeGreaterThan(0)
    await reposar(page)
    await page.screenshot({ path: `${DESTINO}/grafo.png` })
  })

  test('notas', async ({ page }) => {
    await abrirDemo(page, 'notas')
    await irA(page, 'Notas')

    // Datos sembrados a la vista, no esqueletos de carga.
    await expect(page.getByText('El dibujo del gato sobre la mesa')).toBeVisible({
      timeout: 15_000,
    })
    await reposar(page)
    await page.screenshot({ path: `${DESTINO}/notas.png` })
  })

  /**
   * Momentos y no Imprenta: la Imprenta arranca en su estado vacío —correcto,
   * pero una pantalla en blanco no cuenta nada en un README—. La línea de
   * tiempo llega con fotos sembradas y enseña de un vistazo qué guarda la app.
   */
  test('momentos', async ({ page }) => {
    await abrirDemo(page, 'trama')
    await irA(page, 'Momentos')

    await expect(page.getByRole('button', { name: 'Fotos' })).toBeVisible({
      timeout: 15_000,
    })
    // Con contenido de verdad: al menos una entrada en la línea de tiempo.
    await expect(page.locator('li').first()).toBeVisible({ timeout: 15_000 })
    await reposar(page)
    await page.screenshot({ path: `${DESTINO}/momentos.png` })
  })
})
