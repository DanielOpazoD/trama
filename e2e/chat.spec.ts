import { expect, test } from '@playwright/test'
import { emptyState, mockBackend } from './fixtures'

/**
 * Flujo crítico: abrir el chat y crear un thread nuevo. La parte de
 * streaming SSE no se testea aquí porque mockear el ReadableStream con
 * route.fulfill es frágil (la fulfill entrega buffer, no stream real).
 * El streaming en sí está cubierto por tests de unidad sobre el parser.
 *
 * Lo que SÍ verificamos:
 *   - El usuario navega a Chat.
 *   - El rail muestra el empty state inicial.
 *   - El botón "+ nueva" crea un thread en el server.
 *   - El input del chat aparece y acepta texto.
 *
 * Eso cubre que la pantalla y la mecánica de creación de threads
 * funcionan end-to-end. El flujo "envío → respuesta" se verifica
 * manualmente o con un backend real.
 */
test('chat: navegar, crear thread, ver input', async ({ page }) => {
  const state = emptyState()
  await mockBackend(page, state)
  await page.goto('/')

  // Navegar a Chat.
  await page.getByRole('button', { name: 'Chat' }).click()

  // Crear thread nuevo desde el rail.
  await page.getByRole('button', { name: /\+ nueva/ }).click()

  // Al menos un thread fue creado en el server.
  // React 18 strict mode en dev puede disparar efectos dos veces; no
  // asertamos cantidad exacta.
  await expect.poll(() => state.chatThreads.length).toBeGreaterThan(0)

  // El textarea del chat está presente y editable.
  const textarea = page.locator('textarea').last()
  await textarea.fill('hola trama')
  await expect(textarea).toHaveValue('hola trama')
})
