import { expect, test } from '@playwright/test'
import { enableDemoMode } from './fixtures'

/**
 * Un carril horizontal tiene que decir que sigue.
 *
 * Por qué existe: a 375px la barra de secciones del mundo Notas medía 776px de
 * contenido en 232px visibles. Cinco de las ocho secciones (Prompts, Claves,
 * Imprenta, Planillas, Biblioteca) no existían para el usuario — sin degradado,
 * sin flecha, y en macOS sin barra de scroll, porque sólo aparece mientras
 * arrastras. Encima la app te llevaba a Tareas dejándola cortada a media
 * palabra («Tare»), con `scrollLeft` en 0.
 *
 * Ninguno de los 36 gates lo veía, y el gate anti-oclusión tampoco — con razón:
 * el contenido *es* alcanzable con scroll horizontal, así que `findUnreachable`
 * lo aprueba. Es un fallo de descubribilidad, no de alcanzabilidad, y esa
 * categoría no la modelaba nada.
 *
 * Estas comprobaciones no miran el degradado (un píxel dorado no prueba nada);
 * miran el contrato que lo gobierna: el atributo está en true exactamente
 * cuando queda contenido de ese lado. Si el atributo miente, el desvanecido
 * miente.
 *
 * Nota de método: hay que mover el scroll DESDE la página (`evaluate`) o con
 * ratón real. Asignar `scrollLeft` desde el panel de depuración del navegador
 * no dispara el evento `scroll` — el carril se queda mostrando el estado
 * inicial y todo parece correcto sin serlo.
 */

const CARRIL = '.scroll-rail'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('trama:splash-seen', '1')
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await enableDemoMode(page)
  await page.goto('/?world=notas&section=tareas')
  await page.locator(CARRIL).waitFor()
})

test('la sección activa llega entera a la vista, no cortada', async ({ page }) => {
  const recorte = await page.locator(CARRIL).evaluate((rail) => {
    const activa = rail.querySelector('[aria-current="page"]')
    if (!activa) return null
    const a = activa.getBoundingClientRect()
    const r = rail.getBoundingClientRect()
    return {
      texto: (activa.textContent ?? '').trim(),
      porIzquierda: Math.round(Math.max(0, r.left - a.left)),
      porDerecha: Math.round(Math.max(0, a.right - r.right)),
    }
  })

  expect(recorte, 'no hay sección activa marcada con aria-current').not.toBeNull()
  expect(recorte, `la sección activa "${recorte?.texto}" llega cortada`).toMatchObject({
    porIzquierda: 0,
    porDerecha: 0,
  })
})

test('el borde se desvanece sólo del lado que tiene contenido', async ({ page }) => {
  const carril = page.locator(CARRIL)

  // Sanidad: si el carril no desborda, el resto no prueba nada.
  const desborde = await carril.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(desborde, 'el carril no desborda: la prueba sería vacua').toBeGreaterThan(50)

  const irA = async (x: number) => {
    await carril.evaluate((el, destino) => {
      el.scrollLeft = destino
    }, x)
    // Un frame para que el listener mida y React repinte el atributo.
    await page.waitForTimeout(120)
  }

  await irA(0)
  await expect(
    carril,
    'al principio del carril no debe haber desvanecido a la izquierda',
  ).toHaveAttribute('data-rail-start', 'false')
  await expect(carril, 'queda contenido a la derecha y no se anuncia').toHaveAttribute(
    'data-rail-end',
    'true',
  )

  await irA(Math.round(desborde / 2))
  await expect(carril).toHaveAttribute('data-rail-start', 'true')
  await expect(carril).toHaveAttribute('data-rail-end', 'true')

  await irA(desborde)
  await expect(carril).toHaveAttribute('data-rail-start', 'true')
  await expect(
    carril,
    'al final del carril no debe haber desvanecido a la derecha',
  ).toHaveAttribute('data-rail-end', 'false')
})

/**
 * El desvanecido es una máscara y no un degradado superpuesto justamente para
 * no tapar los botones del borde. Si alguien lo cambia por un overlay, esto
 * cae: el primer botón dejaría de recibir el clic en su propia caja.
 */
test('el desvanecido no intercepta el clic de los botones del borde', async ({
  page,
}) => {
  const alcanzable = await page.locator(CARRIL).evaluate((rail) => {
    const caja = rail.getBoundingClientRect()
    return (
      [...rail.querySelectorAll('button')]
        .map((b) => {
          const r = b.getBoundingClientRect()
          const dentro =
            Math.max(0, Math.min(r.right, caja.right) - Math.max(r.left, caja.left)) /
            r.width
          const encima = document.elementFromPoint(
            r.left + r.width / 2,
            r.top + r.height / 2,
          )
          return {
            texto: (b.textContent ?? '').trim(),
            dentro,
            recibeElClic: b === encima || b.contains(encima),
          }
        })
        // Un botón a medio salir tiene el centro fuera de la caja del carril y
        // no responde ahí — es correcto, no es lo que se está probando.
        .filter((b) => b.dentro > 0.95)
    )
  })

  expect(alcanzable.length, 'ningún botón visible que comprobar').toBeGreaterThan(1)
  for (const b of alcanzable) {
    expect(b.recibeElClic, `"${b.texto}" no recibe su propio clic`).toBe(true)
  }
})
