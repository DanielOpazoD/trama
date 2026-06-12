import { expect, test } from '@playwright/test'
import { enableDemoMode } from './fixtures'

test('mundo notas mobile demo: inicio, nota y tarea inicial no generan overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enableDemoMode(page, { world: 'notas' })

  await page.goto('/?world=notas')

  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible()
  await expect(page.getByRole('button', { name: /nueva nota/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /nueva tarea/i })).toBeVisible()

  await page.getByRole('button', { name: 'Notas', exact: true }).click()
  await expect(page.getByPlaceholder(/Escribe una nota/)).toBeVisible()

  await page.getByRole('button', { name: 'Tareas', exact: true }).click()
  await expect(page.getByText('Nueva').first()).toBeVisible()
  await expect(page.getByPlaceholder(/Agregar recordatorio/).first()).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})
