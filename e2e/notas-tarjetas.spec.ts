import { expect, test } from '@playwright/test'
import { enableDemoMode } from './fixtures'

/**
 * Cómo se ven las notas: recorte, fundido y densidad.
 *
 * Estas tres cosas sólo se pueden comprobar con geometría pintada, así que no
 * caben en la suite unitaria: happy-dom no hace layout, y ahí un recorte a
 * media línea o una tarjeta que no adapta miden exactamente igual que uno bien
 * hecho.
 *
 * Los tres defectos que fijan, todos medidos antes de arreglarlos:
 *
 *  - El recorte era `max-height: 320px` con renglones de 26px: cabían 12,31
 *    líneas y la número trece salía partida por la mitad, una banda de medias
 *    letras bajo el texto.
 *  - El fundido era un degradado superpuesto que terminaba en `paper-100`
 *    sólido, pero el fondo de la tarjeta ahí es un degradado que a esa altura
 *    ya va por `paper-50/0.42`. Resultado: un rectángulo gris pegado bajo el
 *    texto, evidente en los temas oscuros.
 *  - La tarjeta medía 278px de alto igual a 375px que a 1280px, con cada pieza
 *    en la misma coordenada: no tenía diseño de escritorio, sólo el de móvil
 *    estirado.
 */

const NOTA_LARGA = [
  'Ideas de informativos audiovisuales:',
  'DIABETES',
  '- Por qué es importante cuidar la diabetes, tipos de complicaciones y exámenes.',
  '- Diabetes y necesidad de insulinoterapia. ¿Cuándo iniciar habitualmente?',
  'Mitos urbanos: empezó insulina y quedó ciego. Empezó insulina y le amputaron el pie.',
  '- Importancia del peso en el control de diabetes, presión arterial y dislipidemia.',
  'DISLIPIDEMIA',
  '- Problema de tener LDL alto.',
  '- Riesgos de tener triglicéridos altos.',
  '- Metas según riesgo cardiovascular.',
  '- Cuándo se indica estatina y por qué no se suspende sola.',
  '- Qué mide cada examen y cada cuánto repetirlo.',
  '- Señales de alarma que obligan a consultar antes.',
  '- Qué esperar de los primeros tres meses de tratamiento.',
].join('\n')

test.beforeEach(async ({ page }) => {
  await enableDemoMode(page, { world: 'notas' })
  await page.addInitScript(() => {
    window.sessionStorage.setItem('trama:splash-seen', '1')
  })
  await page.goto('/?world=notas&section=notas')

  // Se escribe por el composer, que es el camino real. Sembrar el store de la
  // demo no vale: `enableDemoMode` lo borra en cada navegación, así que la
  // semilla desaparecía en la recarga y la prueba quedaba sin nota larga.
  const composer = page.getByPlaceholder(/Escribe una nota/)
  await composer.fill(NOTA_LARGA)
  await page.getByRole('button', { name: /Guardar nota/i }).click()

  await page
    .getByRole('button', { name: /Leer la nota completa/i })
    .first()
    .waitFor()
})

test('el recorte cae en frontera de renglón, sin partir letras', async ({ page }) => {
  const medida = await page
    .getByRole('button', { name: /Leer la nota completa/i })
    .first()
    .evaluate((boton) => {
      const cuerpo = boton.closest('article')!.querySelector('.text-clamp')!
      const cs = getComputedStyle(cuerpo)
      const alturaLinea = parseFloat(cs.lineHeight)
      const visible = cuerpo.clientHeight
      return {
        alturaLinea,
        visible,
        lineas: visible / alturaLinea,
        sobra: cuerpo.scrollHeight > cuerpo.clientHeight,
      }
    })

  expect(medida.sobra, 'la nota no se está recortando: la prueba sería vacua').toBe(true)
  expect(medida.alturaLinea).toBeGreaterThan(0)
  // El alto visible es un múltiplo entero de la altura de línea (±1px de
  // redondeo del navegador). Antes eran 12,31 líneas.
  const resto = medida.lineas % 1
  expect(
    Math.min(resto, 1 - resto),
    `caben ${medida.lineas.toFixed(2)} renglones: el último sale partido`,
  ).toBeLessThan(0.05)
})

/**
 * El viaje de ida Y VUELTA. Mis primeras pruebas sólo miraban el estado
 * plegado, y con eso pasó desapercibido que expandir rompía el plegado: al
 * abrirse, el elemento deja de recortar, `scrollHeight > clientHeight` da falso
 * y el botón —que sólo se pinta cuando sobra texto— desaparecía. La nota se
 * quedaba abierta para siempre, sin forma de volver.
 */
test('se expande y se vuelve a plegar', async ({ page }) => {
  const leerMas = page.getByRole('button', { name: /Leer la nota completa/i }).first()
  const nota = () => page.locator('article').filter({ hasText: 'DISLIPIDEMIA' }).first()

  const plegada = await nota().evaluate((el) => el.getBoundingClientRect().height)
  await leerMas.click()

  const mostrarMenos = page.getByRole('button', { name: /Mostrar menos/i }).first()
  await expect(mostrarMenos, 'sin control para volver a plegar').toBeVisible()

  const abierta = await nota().evaluate((el) => el.getBoundingClientRect().height)
  expect(abierta).toBeGreaterThan(plegada)

  await mostrarMenos.click()
  await expect(leerMas).toBeVisible()
  const replegada = await nota().evaluate((el) => el.getBoundingClientRect().height)
  expect(Math.abs(replegada - plegada)).toBeLessThan(4)
})

test('el fundido no pinta ningún color sólido encima del texto', async ({ page }) => {
  const hallazgos = await page
    .getByRole('button', { name: /Leer la nota completa/i })
    .first()
    .evaluate((boton) => {
      const tarjeta = boton.closest('article')!
      // Un overlay tiene que acertar el color del fondo, y el de la tarjeta
      // cambia con la altura y con el tema. La máscara no tiene nada que
      // acertar: por eso el contrato es «ningún degradado superpuesto».
      return [...tarjeta.querySelectorAll('*')]
        .filter((el) => {
          const cs = getComputedStyle(el)
          return (
            cs.position === 'absolute' &&
            cs.backgroundImage.includes('gradient') &&
            el.getBoundingClientRect().width > 40
          )
        })
        .map((el) => getComputedStyle(el).backgroundImage.slice(0, 80))
    })

  expect(hallazgos, `hay ${hallazgos.length} degradado(s) superpuesto(s)`).toEqual([])

  // Y el texto sí lleva máscara: el desvanecido existe, sólo que sin color.
  const mascara = await page
    .getByRole('button', { name: /Leer la nota completa/i })
    .first()
    .evaluate((boton) => {
      const cuerpo = boton.closest('article')!.querySelector('.text-clamp')!
      const cs = getComputedStyle(cuerpo)
      return cs.maskImage || cs.webkitMaskImage
    })
  expect(mascara).toMatch(/gradient/)
})

test('en escritorio el texto va AL LADO de la miniatura; en móvil, debajo', async ({
  page,
}) => {
  const geometria = async () =>
    page
      .locator('li.card-paper-soft')
      .filter({ has: page.locator('[data-testid="link-media-image"]') })
      .first()
      .evaluate((tarjeta) => {
        const mini = tarjeta
          .querySelector('[data-testid="link-media-image"]')!
          .getBoundingClientRect()
        const texto = tarjeta.querySelector('p.font-serif')!.getBoundingClientRect()
        return {
          alLado: texto.left >= mini.right - 2,
          debajo: texto.top >= mini.bottom - 2,
        }
      })

  await page.setViewportSize({ width: 375, height: 812 })
  expect(
    (await geometria()).debajo,
    'en móvil la miniatura y el texto deben apilarse',
  ).toBe(true)

  await page.setViewportSize({ width: 1280, height: 900 })
  // Antes la tarjeta medía lo mismo a 375 que a 1280 con cada pieza en la misma
  // coordenada: el texto caía SIEMPRE debajo y sobraban 672px de ancho. Se mide
  // la posición y no la altura — la altura también baja al ensanchar por el
  // simple reflujo del texto, así que un test sobre ella pasaría igual sin
  // diseño de escritorio (comprobado por mutación).
  expect(
    (await geometria()).alLado,
    'en escritorio el texto debe ir junto a la miniatura, no debajo',
  ).toBe(true)
})

test('la etiqueta de tipo está junto a lo que etiqueta', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const distancia = await page
    .locator('li.card-paper-soft')
    .filter({ has: page.locator('[data-testid="link-media-image"]') })
    .first()
    .evaluate((tarjeta) => {
      const etiqueta = [...tarjeta.querySelectorAll('*')].find(
        (el) =>
          el.children.length === 0 &&
          /^(imagen|enlace|texto|audio|pdf|video)$/i.test((el.textContent ?? '').trim()),
      )
      const mini = tarjeta.querySelector('[data-testid="link-media-image"]')
      if (!etiqueta || !mini) return null
      return Math.round(
        etiqueta.getBoundingClientRect().left - mini.getBoundingClientRect().right,
      )
    })

  expect(distancia, 'no encontré la etiqueta de tipo o la miniatura').not.toBeNull()
  // Antes: 617px, con `justify-between` mandándola al extremo opuesto de una
  // fila de 930. Una etiqueta a esa distancia de su sujeto no etiqueta nada.
  expect(distancia!).toBeLessThan(200)
})
