import { expect, test, type Page, type Route } from '@playwright/test'
import { emptyState, mockBackend } from './fixtures'

/**
 * La barra de Imprenta: pocos controles, agrupados por lo que son.
 *
 * Antes mostraba ocho controles a la vez y **con el documento vacío cuatro no
 * podían hacer nada**: la primaria deshabilitada, ajustes de un documento que
 * no existe, «Nuevo documento» en un documento ya nuevo, y un control
 * segmentado `1 2 4 6` sin etiqueta —números sueltos con un icono diminuto—
 * que además sólo importa en el instante de importar.
 *
 * Peor: «Nuevo documento», que descarta el trabajo, estaba **pegado** al botón
 * de guardar. Un clic de más y se perdía el documento.
 *
 * Y los ajustes vivían repartidos entre dos menús sin regla que se pudiera
 * adivinar: numeración, encabezado y pie en «Página»; marca de agua y
 * compresión en «···». Con el añadido de que «imágenes por hoja» aparecía dos
 * veces, segmentado en escritorio y como selector en móvil.
 *
 * Lo que se fija aquí es lo comprobable de ese rediseño.
 */

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)

function jsonResp(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

/** Un recorte con imagen, para poder llegar a un documento con páginas. */
async function conRecorteImagen(page: Page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('trama:splash-seen', '1')
  })
  await mockBackend(page, emptyState())

  const recorte = {
    id: 'r-barra-1',
    text: 'Foto de prueba',
    source_url: null,
    source_title: 'Recibo',
    source_author: null,
    note: null,
    image_url: null,
    image_key: 'user-1/recibo.png',
    images: [{ storage_key: 'user-1/recibo.png' }],
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
          { type: 'recorte', id: recorte.id, createdAt: recorte.created_at, recorte },
        ],
        nextCursor: null,
      }),
  )
  await page.route(
    (url) => url.pathname === '/api/recortes-image/user-1/recibo.png',
    (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PIXEL_PNG }),
  )
}

const BARRA = '[role="toolbar"][aria-label="Acciones del documento PDF"]'

/** Controles realmente visibles de la barra, con su etiqueta. */
async function controlesDeLaBarra(page: Page): Promise<string[]> {
  return page
    .locator(BARRA)
    .evaluate((barra) =>
      [...barra.querySelectorAll('button, select, input')]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) =>
          ((el.textContent ?? '').trim() || el.getAttribute('aria-label') || el.tagName)
            .replace(/\s+/g, ' ')
            .slice(0, 30),
        ),
    )
}

test.describe('Barra de Imprenta', () => {
  test('con el documento vacío sólo ofrece traer algo', async ({ page }) => {
    await conRecorteImagen(page)
    await page.goto('/?world=notas&section=pdf')
    await page.locator(BARRA).waitFor()

    const controles = await controlesDeLaBarra(page)
    // El lienzo ya lleva la invitación y los formatos aceptados; la barra no
    // necesita repetirlo con controles que no pueden actuar.
    expect(controles, `la barra muestra ${controles.length} controles`).toEqual([
      'Importar',
    ])
  })

  test('con documento, descartar no está junto a guardar', async ({ page }) => {
    await conRecorteImagen(page)
    await page.goto('/?world=notas&section=notas&segment=capturas')
    await page.getByRole('button', { name: 'Acciones del recorte' }).first().click()
    await page.getByRole('menuitem', { name: /Imprenta/i }).click()
    await expect(page.getByAltText('Página 1').first()).toBeVisible({ timeout: 15_000 })

    const controles = await controlesDeLaBarra(page)
    // Ninguna acción destructiva suelta en la barra.
    expect(controles.join(' | ')).not.toMatch(/nuevo documento|descartar/i)
    // Y la primaria sigue ahí.
    expect(controles.join(' | ')).toMatch(/guardar|exportar|imprimir/i)
  })

  test('descartar vive en el menú y está marcado como destructivo', async ({ page }) => {
    await conRecorteImagen(page)
    await page.goto('/?world=notas&section=notas&segment=capturas')
    await page.getByRole('button', { name: 'Acciones del recorte' }).first().click()
    await page.getByRole('menuitem', { name: /Imprenta/i }).click()
    await expect(page.getByAltText('Página 1').first()).toBeVisible({ timeout: 15_000 })

    await page
      .locator(BARRA)
      .getByRole('button', { name: 'Más acciones del documento' })
      .click()
    const descartar = page.getByRole('menuitem', { name: /descartar/i })
    await expect(descartar).toBeVisible()

    // Rojo, no del color del texto normal: descartar el trabajo tiene que
    // leerse distinto del resto del menú.
    const esDestructivo = await descartar.evaluate((el) => {
      const propio = getComputedStyle(el).color
      const hermanos = [
        ...(el.parentElement?.querySelectorAll('[role="menuitem"]') ?? []),
      ]
        .filter((otro) => otro !== el)
        .map((otro) => getComputedStyle(otro).color)
      return hermanos.length > 0 && hermanos.every((color) => color !== propio)
    })
    expect(esDestructivo, 'descartar se ve igual que las demás opciones').toBe(true)
  })

  test('todos los ajustes del documento viven en un solo menú', async ({ page }) => {
    await conRecorteImagen(page)
    await page.goto('/?world=notas&section=notas&segment=capturas')
    await page.getByRole('button', { name: 'Acciones del recorte' }).first().click()
    await page.getByRole('menuitem', { name: /Imprenta/i }).click()
    await expect(page.getByAltText('Página 1').first()).toBeVisible({ timeout: 15_000 })

    await page
      .locator(BARRA)
      .getByRole('button', { name: 'Ajustes del documento' })
      .click()

    // Los cinco ajustes, juntos: antes estaban repartidos entre dos menús sin
    // regla adivinable, y uno aparecía duplicado por breakpoint.
    for (const ajuste of [
      /numerar páginas/i,
      /encabezado/i,
      /pie de página/i,
      /marca de agua/i,
      /imágenes por hoja/i,
    ]) {
      await expect(
        page.getByText(ajuste).first(),
        `falta un ajuste en el menú único: ${ajuste}`,
      ).toBeVisible()
    }
  })
})
