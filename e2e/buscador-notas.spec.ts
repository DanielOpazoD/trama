import { expect, test } from '@playwright/test'
import { emptyState, enableDemoMode, mockBackend } from './fixtures'

/**
 * El buscador del mundo Notas y las teclas del feed que queda detrás. Medido
 * antes del arreglo: con el diálogo abierto y el foco en «hecha», la tecla «n»
 * del feed sacaba el foco al compositor, fuera del diálogo modal.
 *
 * Los localizadores son de rol, no de rótulo: el diálogo y su disparador
 * cambian de nombre cuando el mundo Notas usa el buscador de Trama.
 */
test('con el buscador abierto, las teclas del feed no le roban el foco', async ({
  page,
}) => {
  await page.addInitScript(() => window.sessionStorage.setItem('trama:splash-seen', '1'))
  await mockBackend(page, emptyState())
  await enableDemoMode(page, { world: 'notas' })
  await page.goto('/?world=notas&section=notas')

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
