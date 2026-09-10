import { expect, test, type Page } from '@playwright/test'
import { emptyState, enableDemoMode, mockBackend } from './fixtures'

/**
 * El buscador del mundo Notas: la misma paleta ⌘K de Trama, con notas, tareas y
 * prompts. Medido antes de unificarlo, en demo: ⌘K no hacía nada en Notas,
 * «Buscar en Notas» no tenía teclado ni encontraba «edición» al escribir
 * «edicion», y enseñaba la nota de una sección protegida con PIN. Con aquel
 * diálogo abierto y el foco en «hecha», la «n» del feed sacaba el foco al
 * compositor.
 */
const APP_ROTA = /La trama se rompió/

async function entrar(page: Page, section = 'inicio') {
  await page.addInitScript(() => window.sessionStorage.setItem('trama:splash-seen', '1'))
  await mockBackend(page, emptyState())
  await enableDemoMode(page, { world: 'notas' })
  await page.goto(`/?world=notas&section=${section}`)
}

async function buscador(page: Page) {
  await page
    .getByRole('button', { name: /^Buscar/ })
    .first()
    .click({ timeout: 15_000 })
  const dialogo = page.getByRole('dialog', { name: 'Buscar', exact: true })
  await expect(dialogo).toBeVisible()
  return dialogo
}

test('con el buscador abierto, las teclas del feed no le roban el foco', async ({
  page,
}) => {
  await entrar(page, 'notas')
  await page
    .getByRole('button', { name: /^Buscar/ })
    .first()
    .click({ timeout: 15_000 })
  const dialogo = page.locator('[role="dialog"][aria-modal="true"]')
  await expect(dialogo).toBeVisible()
  await dialogo.getByRole('textbox').first().fill('tinta')
  const hecha = dialogo.getByRole('button', { name: /hecha/i }).first()
  await hecha.focus()

  await page.keyboard.press('n')
  await expect(hecha).toBeFocused()
  await expect(dialogo).toBeVisible()
})

test.describe('el buscador de los dos mundos, desde Notas', () => {
  test('⌘K abre la paleta, y es el único diálogo', async ({ page }) => {
    await entrar(page)
    await page
      .getByRole('button', { name: /^Buscar/ })
      .first()
      .waitFor({ timeout: 15_000 })
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByRole('dialog', { name: 'Buscar', exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('Buscar o preguntar…')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(1)
  })

  test('encuentra sin tildes, y Enter abre la sección de la nota', async ({ page }) => {
    await entrar(page)
    const dialogo = await buscador(page)
    await dialogo.getByPlaceholder('Buscar o preguntar…').fill('edicion')
    await expect(
      dialogo.getByRole('button', { name: /^Comprar la edición anotada/ }),
    ).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(dialogo).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Notas', exact: true }).first(),
    ).toHaveAttribute('aria-current', 'page')
  })

  test('«hecha» marca la tarea y el buscador sigue abierto; ⇧Enter hace lo mismo', async ({
    page,
  }) => {
    await entrar(page)
    const dialogo = await buscador(page)
    const campo = dialogo.getByPlaceholder('Buscar o preguntar…')

    await campo.fill('tinta')
    const hecha = dialogo.getByRole('button', {
      name: 'Marcar hecha: Comprar tinta para la #pluma',
    })
    // Con el teclado, Tab hasta la acción y Enter: el botón se desmonta al marcar la
    // tarea, y el foco tiene que volver al campo en vez de caer detrás del diálogo.
    await hecha.focus()
    await page.keyboard.press('Enter')
    await expect(hecha).toHaveCount(0)
    await expect(campo).toBeFocused()
    await expect(page.getByText('Tarea marcada como hecha.')).toBeVisible()
    await expect(dialogo).toBeVisible()

    await campo.fill('correo de la editorial')
    const otra = dialogo.getByRole('button', {
      name: 'Marcar hecha: Responder el correo de la editorial',
    })
    await expect(otra).toBeVisible()
    await campo.press('Shift+Enter')
    await expect(otra).toHaveCount(0)
    await expect(dialogo).toBeVisible()
  })

  test('«copiar» copia el prompt y lo avisa', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await entrar(page)
    const dialogo = await buscador(page)
    await dialogo.getByPlaceholder('Buscar o preguntar…').fill('sintesis')
    await dialogo
      .getByRole('button', { name: 'Copiar prompt: Síntesis de lectura' })
      .first()
      .click()
    await expect(page.getByText('Prompt copiado.')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      'La tesis en una frase',
    )
  })

  test('una sección protegida con PIN no enseña su contenido', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('trama:splash-seen', '1')
      if (!window.sessionStorage.getItem('reinicio-hecho')) {
        window.localStorage.removeItem('trama-demo-store')
        window.sessionStorage.setItem('reinicio-hecho', '1')
      }
    })
    await mockBackend(page, emptyState())
    await enableDemoMode(page, { world: 'notas', resetStore: false })
    await page.goto('/?world=notas&section=inicio')
    await page
      .getByRole('button', { name: /^Buscar/ })
      .first()
      .waitFor({ timeout: 15_000 })
    // Sobre la semilla ya guardada: un almacén parcial vaciaría las tablas y el
    // test pasaría sin notas que esconder.
    const sembrado = await page.evaluate(() => {
      const store = JSON.parse(window.localStorage.getItem('trama-demo-store') ?? 'null')
      if (!store?.notes?.length) return false
      store.user_prefs = {
        ...(store.user_prefs ?? {}),
        pinnedSections: { 'notas:notas': true },
      }
      window.localStorage.setItem('trama-demo-store', JSON.stringify(store))
      return true
    })
    expect(sembrado).toBe(true)
    await page.reload()

    const dialogo = await buscador(page)
    const campo = dialogo.getByPlaceholder('Buscar o preguntar…')
    await campo.fill('tinta')
    await expect(
      dialogo.getByRole('button', { name: /^Marcar hecha: Comprar tinta/ }),
    ).toBeVisible()
    await campo.fill('comprar pan')
    await expect(dialogo.getByRole('status')).toContainText('resultados')
    await expect(
      dialogo.getByRole('button', { name: /comprar pan y leche/i }),
    ).toHaveCount(0)
  })

  test('una vista elegida en Notas cruza a Trama', async ({ page }) => {
    await entrar(page)
    const dialogo = await buscador(page)
    await dialogo.getByPlaceholder('Buscar o preguntar…').fill('>momentos')
    await expect(dialogo.getByRole('button', { name: /^Momentos/ })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Momentos', level: 2 })).toBeVisible()
    await expect(page.getByText(APP_ROTA)).toHaveCount(0)
  })

  test('una entidad elegida en Notas abre su ficha en Trama', async ({ page }) => {
    await entrar(page)
    const dialogo = await buscador(page)
    await dialogo.getByPlaceholder('Buscar o preguntar…').fill('@borges')
    await expect(dialogo.getByRole('button', { name: /Borges/ }).first()).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/entity=/)
    await expect(page.getByText(APP_ROTA)).toHaveCount(0)
  })

  test('«/» abre el buscador en Tareas; en el feed, su propio filtro', async ({
    page,
  }) => {
    await entrar(page, 'tareas')
    await page
      .getByRole('button', { name: /^Buscar/ })
      .first()
      .waitFor({ timeout: 15_000 })
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('/')
    const dialogo = page.getByRole('dialog', { name: 'Buscar', exact: true })
    await expect(dialogo).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialogo).toHaveCount(0)

    await page.getByRole('button', { name: 'Notas', exact: true }).first().click()
    await page.getByPlaceholder(/Escribe una nota/).waitFor()
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('/')
    await expect(page.getByPlaceholder(/Buscar en notas y capturas/)).toBeFocused()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
