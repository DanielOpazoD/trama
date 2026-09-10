import { expect, test } from '@playwright/test'
import { enableDemoMode } from './fixtures'

/**
 * En el mundo Notas, `#main-scroll` no puede salirse de `<main>`.
 *
 * Estuvo roto sin que nada fallara. La barra superior es hermana del scroller
 * dentro de un padre de bloque, y el scroller era `h-full`: medía el alto
 * entero empezando 43 px más abajo, así que sus últimos 43 px quedaban fuera
 * de lo visible en las seis secciones (medido: scroller hasta y=943 con
 * `<main>` hasta 900). Lo disimulaba el padding inferior de la columna.
 *
 * Se mide con geometría de LAYOUT (`offsetTop`/`offsetHeight`), no con
 * `getBoundingClientRect`. La entrada de la sección anima con `transform`, y
 * `getBoundingClientRect` lo incluye: la primera versión de este test falló
 * sobre el código correcto a los ~600 ms porque el padre seguía desplazado
 * 2,8 px (8 px en móvil) por la animación. El defecto que se vigila es
 * estructural —43 px permanentes— y el layout no ve transforms, así que la
 * comprobación no depende del reloj.
 *
 * La suite unitaria corre en happy-dom, que no calcula layout: esto solo lo
 * puede ver un e2e.
 */
for (const vp of [
  { nombre: 'escritorio', width: 1440, height: 900 },
  { nombre: 'móvil', width: 390, height: 844 },
]) {
  test(`el scroller de Notas cabe en <main> (${vp.nombre})`, async ({ page }) => {
    await enableDemoMode(page, { world: 'notas' })
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/')
    await expect(page.locator('#main-scroll')).toBeVisible({ timeout: 15_000 })

    const { fondo, alto } = await page.evaluate(() => {
      const scroller = document.getElementById('main-scroll')
      const main = scroller?.closest('main')
      if (!scroller || !main) throw new Error('falta #main-scroll dentro de <main>')
      // Desplazamiento de layout respecto de <main>: offsetTop sumado por la
      // cadena de offsetParent, que ignora transforms.
      let top = 0
      let el: HTMLElement | null = scroller
      while (el && el !== main) {
        top += el.offsetTop
        el = el.offsetParent as HTMLElement | null
      }
      if (el !== main)
        throw new Error('<main> no es el ancestro posicionado del scroller')
      return { fondo: top + scroller.offsetHeight, alto: main.clientHeight }
    })

    expect(
      fondo,
      `el scroller termina en ${fondo} px y <main> mide ${alto}`,
    ).toBeLessThanOrEqual(alto)
  })
}
