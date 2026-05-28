import { expect, test } from '@playwright/test'
import { emptyState, mockBackend } from './fixtures'

/**
 * Chat — enviar un mensaje y ver la respuesta mock del asistente.
 *
 * El fixture ya mockea POST /api/chat/threads/:id/messages con SSE que
 * incluye el chunk "Hola, te leo. (respuesta mock)". Este test verifica
 * que el flujo completo funciona end-to-end en el cliente.
 */
test('chat: enviar mensaje y ver respuesta del asistente', async ({ page }) => {
  const state = emptyState()
  await mockBackend(page, state)
  await page.goto('/')

  // Navegar a Chat.
  await page.getByRole('button', { name: 'Chat' }).click()

  // Crear thread nuevo.
  await page.getByRole('button', { name: /\+ nueva/ }).click()

  // Esperar a que el thread exista en el estado mock.
  await expect.poll(() => state.chatThreads.length).toBeGreaterThan(0)

  // El textarea del chat: usamos el localizador de último textarea
  // (la vista solo tiene uno visible en este contexto).
  const textarea = page.locator('textarea').last()
  await textarea.fill('¿Quién fue Simone Weil?')

  // Enviar con el botón "Enviar".
  await page.getByRole('button', { name: 'Enviar' }).click()

  // La respuesta mock debe aparecer en el chat.
  await expect(page.getByText('Hola, te leo. (respuesta mock)')).toBeVisible({
    timeout: 15_000,
  })
})
