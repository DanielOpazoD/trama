import { expect, test } from '@playwright/test'
import { enableDemoMode } from './fixtures'

/**
 * Historial de prompts: editar no debe perder lo que había.
 *
 * Por qué existe: hasta ahora cada edición pisaba el texto anterior sin dejar
 * rastro. Un prompt se afina probando redacciones, así que perder la que
 * funcionaba es perder el trabajo, no una versión.
 *
 * Lo que se comprueba no es que aparezca una lista, sino la garantía completa:
 * después de editar, el texto viejo sigue estando; después de restaurar, el
 * texto que era el actual TAMBIÉN sigue estando. Sin la segunda mitad,
 * restaurar sería otra forma de perder.
 */

const TARJETA = 'article:has-text("Síntesis de lectura")'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('trama:splash-seen', '1')
  })
  await enableDemoMode(page, { world: 'notas' })
  await page.goto('/?world=notas&section=prompts')
  await page.locator(TARJETA).first().waitFor()
})

test('el historial guarda lo que había antes de cada edición', async ({ page }) => {
  const tarjeta = page.locator(TARJETA).first()
  await tarjeta.getByRole('button', { name: 'historial' }).click()

  const versiones = tarjeta.locator('ol > li')
  await expect(versiones).toHaveCount(2)

  // Cada fila dice qué cambió la edición que la reemplazó: es lo que convierte
  // una pila de textos casi iguales en algo legible de un vistazo.
  await expect(versiones.first()).toContainText('cambió contenido')
  await expect(versiones.last()).toContainText('cambió título y contenido')
  await expect(versiones.last()).toContainText('Resume {{texto}} en tres puntos.')
})

/**
 * El caso que da nombre a todo: editar. Los demás tests parten del historial
 * sembrado, así que sin éste se podría desactivar el guardado entero y la suite
 * seguiría en verde — comprobado por mutación.
 */
test('editar guarda el texto anterior sin que haya que pedirlo', async ({ page }) => {
  const tarjeta = page.locator(TARJETA).first()
  await tarjeta.getByRole('button', { name: 'historial' }).click()
  await expect(tarjeta.locator('ol > li')).toHaveCount(2)

  await tarjeta.getByRole('button', { name: 'Editar prompt' }).click()

  // En edición el título vive dentro de un `input`, y `has-text` no ve valores
  // de formulario: la tarjeta deja de coincidir con su propio selector. Se
  // localiza el editor a nivel de página, que es el único abierto.
  const cuerpo = page.getByLabel('Contenido del prompt')
  const textoViejo = await cuerpo.inputValue()
  await cuerpo.fill('Un texto completamente distinto para {{texto}}.')
  await page.getByRole('button', { name: 'guardar' }).click()

  // El historial sigue abierto y se refresca solo: su clave de caché cuelga de
  // `['prompts']`, así que la invalidación del guardado también la alcanza.
  const editada = page.locator('article:has-text("completamente distinto")').first()

  // El historial creció y lo que había sigue estando, entero.
  await expect(editada.locator('ol > li')).toHaveCount(3)
  await expect(editada.locator('ol > li').first()).toContainText(
    textoViejo.split('\n')[0]!,
  )
  await expect(editada.locator('ol > li').first()).toContainText('cambió contenido')
})

test('restaurar no destruye: lo actual queda guardado a su vez', async ({ page }) => {
  const tarjeta = page.locator(TARJETA).first()
  await tarjeta.getByRole('button', { name: 'historial' }).click()
  await expect(tarjeta.locator('ol > li')).toHaveCount(2)

  const textoActual = await tarjeta.locator('h3').innerText()
  await tarjeta
    .locator('ol > li')
    .last()
    .getByRole('button', { name: 'restaurar' })
    .click()

  // El prompt pasa a ser el viejo…
  const restaurada = page.locator('article:has-text("Resumen de lectura")').first()
  await expect(restaurada.locator('h3')).toHaveText('Resumen de lectura')

  // …y el que era actual NO se perdió: está en el historial, que creció.
  await expect(restaurada.locator('ol > li')).toHaveCount(3)
  await expect(restaurada.locator('ol')).toContainText(textoActual)
})

test('un cambio que no toca el texto no ensucia el historial', async ({ page }) => {
  const tarjeta = page.locator(TARJETA).first()
  await tarjeta.getByRole('button', { name: 'historial' }).click()
  await expect(tarjeta.locator('ol > li')).toHaveCount(2)

  // Soltar el favorito es un PATCH, pero no cambia texto: nada que versionar.
  await tarjeta.getByRole('button', { name: 'soltar' }).click()
  await expect(tarjeta.getByRole('button', { name: 'favorito' })).toBeVisible()

  await expect(tarjeta.locator('ol > li')).toHaveCount(2)
})

test('el buscador encuentra por variable y sin tildes', async ({ page }) => {
  const buscador = page.getByPlaceholder('Buscar por título, texto o variable…')

  await buscador.fill('sintesis')
  await expect(page.locator('article')).toHaveCount(1)

  // `parrafo` sólo existe como variable: no aparece en ningún título.
  await buscador.fill('parrafo')
  await expect(page.locator('article')).toHaveCount(1)
  await expect(page.locator('article').first()).toContainText('Reescribir sin adjetivos')

  // Y las tildes no cuentan: la colección es «Investigación».
  await buscador.fill('investigacion')
  const sinTilde = await page.locator('article').count()
  await buscador.fill('investigación')
  await expect(page.locator('article')).toHaveCount(sinTilde)
  expect(sinTilde).toBeGreaterThan(0)

  await buscador.fill('no existe nada así')
  await expect(page.getByText('Ningún prompt coincide.')).toBeVisible()
})
