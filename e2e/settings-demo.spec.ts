import { expect, test } from '@playwright/test'
import { enableDemoMode } from './fixtures'

/**
 * Configuración abre en modo prueba sin llevarse la aplicación.
 *
 * Por qué existe: abrir Configuración en modo demo **tumbaba la app entera** al
 * ErrorBoundary raíz. La respuesta de salud del router de demo no traía `auth`
 * ni `operational`, y el panel los desreferencia en once sitios; la primera
 * sección es «Estado» y carga sola, así que el crash era inmediato.
 *
 * Nada avisaba. El router de demo devuelve `unknown`, de modo que el tipo
 * declarado —donde ambos campos son obligatorios— nunca llegaba a comprobarse.
 * Y `HealthPanel.test.tsx` estaba en verde porque sus fixtures **sí** traen
 * `auth`: los tests describían un shape que la app no siempre produce.
 *
 * Ningún e2e abría Configuración en demo. `settings-data.spec.ts` usa
 * `mockBackend`, que devuelve otra cosa. Por eso un fallo total pasó meses
 * inadvertido en la vía por la que alguien prueba Trama.
 */

const SECCIONES = [
  'Estado',
  'Logs',
  'Apariencia',
  'Personalización',
  'Privacidad',
  'Spotify',
  'Extensión',
  'WhatsApp',
  'X (Twitter)',
  'IA por tarea',
  'Búsqueda',
  'Datos',
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('trama:splash-seen', '1')
  })
  await enableDemoMode(page, { world: 'notas' })
  await page.goto('/?world=notas&section=inicio')
  await page.getByRole('button', { name: 'Configuración' }).first().click()
})

/** El ErrorBoundary raíz: si aparece, se cayó la aplicación entera. */
async function noSeCayo(page: import('@playwright/test').Page, donde: string) {
  await expect(
    page.getByText('La trama se rompió.'),
    `la app se cayó en «${donde}»`,
  ).toHaveCount(0)
}

/**
 * Antes ni siquiera se llegaba: el control de modo prueba vivía en `left-3
 * bottom-3`, la misma columna que el botón de Configuración de la barra
 * lateral, con las cajas solapadas. El botón no recibía su propio clic, así que
 * en modo prueba Configuración era inalcanzable en escritorio. Lo di por
 * «chrome del arnés» en el barrido visual anterior; no lo era.
 */
test('el control de modo prueba no tapa el botón de Configuración', async ({ page }) => {
  const alcanzable = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) =>
        /^Configuración$/i.test(b.getAttribute('aria-label') ?? '') &&
        b.getBoundingClientRect().width > 0,
    )
    if (!btn) return null
    const r = btn.getBoundingClientRect()
    const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return btn === encima || btn.contains(encima)
  })
  expect(alcanzable, 'no encontré el botón de Configuración').not.toBeNull()
  expect(alcanzable, 'algo tapa el botón de Configuración').toBe(true)
})

test('abrir Configuración no tumba la aplicación', async ({ page }) => {
  await noSeCayo(page, 'al abrir')
  // «Estado» es la sección por defecto y carga sola: es la que reventaba.
  await expect(page.getByText('Estado del sistema')).toBeVisible()
})

/**
 * Las doce secciones, no sólo la que falló. Un hueco en la respuesta de demo se
 * lleva la app entera, así que el riesgo no es «esta pantalla no va» sino «no
 * queda aplicación»; conviene saberlo de todas.
 */
test('ninguna sección de Configuración se cae en modo prueba', async ({ page }) => {
  // El nombre accesible del botón incluye su pista («Estado gasto, conteos,
  // errores»), así que se busca por prefijo dentro de la navegación.
  const nav = page.getByRole('navigation', { name: /secciones de configuración/i })
  for (const seccion of SECCIONES) {
    // «X (Twitter)» trae paréntesis: sin escaparlos el regex los lee como grupo
    // y no encuentra el botón.
    const nombre = new RegExp(`^${seccion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
    const boton = nav.getByRole('button', { name: nombre }).first()
    await boton.click()
    // Sin esto el bucle pasaría aunque el clic no navegara: se quedaría el
    // panel por defecto —que ya sabemos que no revienta— y la comprobación de
    // abajo no distinguiría nada.
    await expect(boton, `«${seccion}» no quedó seleccionada`).toHaveAttribute(
      'aria-current',
      'page',
    )
    await noSeCayo(page, seccion)
  }
})

/**
 * «Copiar detalles» arma el diagnóstico leyendo `data.operational.*`, que era
 * el otro bloque ausente. Aunque el panel ya se pintara, este camino habría
 * reventado igual.
 */
test('copiar el diagnóstico no se cae', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const copiar = page.getByRole('button', { name: /copiar/i }).first()
  // Sin exigir que exista, el día que el control cambie de nombre este test
  // pasaría sin ejercitar nada — verde por no haber hecho el trabajo.
  await expect(copiar, 'no encontré el control de copiar el diagnóstico').toBeVisible()
  await copiar.click()
  await noSeCayo(page, 'copiar diagnóstico')
})

/**
 * La barra de secciones de Configuración usa el mismo patrón de carril
 * horizontal que la de Notas, que en el PR #365 resultó ocultar cinco de ocho
 * secciones sin ninguna señal. No se pudo medir entonces porque esta pantalla
 * no abría; ahora sí.
 */
test('la navegación de Configuración no esconde secciones sin avisar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const medida = await page
    .getByRole('navigation', { name: /secciones de configuración/i })
    .evaluate((nav) => {
      const cs = getComputedStyle(nav)
      return {
        desborda: nav.scrollWidth - nav.clientWidth,
        visible: nav.clientWidth / nav.scrollWidth,
        // Se mira el estilo COMPUTADO y no si lleva la clase: el componente la
        // pone siempre, así que preguntarlo sería una aserción que no puede
        // fallar. Si mañana se rompe la regla CSS del carril, la clase seguiría
        // ahí y el desvanecido no.
        avisa:
          cs.maskImage !== 'none' ||
          cs.webkitMaskImage !== 'none' ||
          getComputedStyle(nav, '::after').content !== 'none',
      }
    })

  // Si desborda de verdad, tiene que haber alguna señal de que sigue.
  if (medida.desborda > 20) {
    expect(
      medida.avisa,
      `oculta el ${Math.round((1 - medida.visible) * 100)}% de las secciones sin ninguna señal`,
    ).toBe(true)
  }
})
