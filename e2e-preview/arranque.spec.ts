import { expect, test } from '@playwright/test'

/**
 * El bundle de producción arranca. Producción estuvo en blanco con el CI en
 * verde: `TypeError: t is not a function` en `vendor-query`, por un ciclo de
 * imports entre chunks que solo existe en el build. Ningún test cargaba el
 * bundle real en un navegador. Este lo hace y falla ante cualquier error no
 * capturado durante el arranque.
 */
test('el build de producción monta la app sin errores no capturados', async ({
  page,
}) => {
  const errores: string[] = []
  page.on('pageerror', (error) => errores.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error')
      errores.push(`console: ${message.text().slice(0, 200)}`)
  })

  await page.goto('/')
  // Algo de la app tiene que estar en pantalla: la portada, el inicio de
  // sesión o la demo. Un `#root` vacío es la pantalla en blanco.
  await expect(page.locator('#root *').first()).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1500)

  // Los fallos de red (sin backend en preview) no cuentan; los errores de
  // ejecución, sí.
  const deEjecucion = errores.filter((e) => !/Failed to load resource|net::ERR_/.test(e))
  expect(deEjecucion).toEqual([])
})
