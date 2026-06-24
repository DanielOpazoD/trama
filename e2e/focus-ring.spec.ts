import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { emptyState, enableDemoMode, mockBackend } from './fixtures'

// Verificación RUNTIME de la CONVENCIÓN DE FOCO en navegador real. El preview
// local apunta a otro checkout, así que esto es la prueba de que los tokens
// RENDERIZAN (no solo de que la clase está presente): que `.focus-ring` dibuja el
// anillo al foco por teclado, que adapta el color por tema, que un control sin
// token cae en el outline global, y que los tokens de selección / focus-within
// producen su box-shadow.

async function makePdfBuffer(): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.addPage([612, 792])
  return Buffer.from(await pdf.save())
}

// Superficie confiable con controles `.focus-ring` reales: el toolbar del editor.
async function openPdfEditor(page: Page) {
  await mockBackend(page, emptyState())
  await page.setViewportSize({ width: 1280, height: 800 })
  await enableDemoMode(page, { world: 'notas' })
  await page.goto('/?world=notas&section=pdf')
  await expect(page.getByRole('heading', { name: 'Imprenta' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'qa-focus.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(),
  })
  const thumb = page.getByAltText('Página 1')
  await expect(thumb).toBeVisible()
  await thumb.dblclick()
  await expect(page.getByRole('dialog', { name: 'Editar página 1' })).toBeVisible()
}

// Tabula (foco por teclado → :focus-visible) hasta un control con `.focus-ring` y
// devuelve su box-shadow enfocado, el de blur (para comparar) y su outline.
async function focusFirstRingControl(page: Page) {
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Tab')
    const r = await page.evaluate(() => {
      const el = document.activeElement
      const cls = el && typeof el.className === 'string' ? el.className : ''
      if (!/\bfocus-ring(-inset)?\b/.test(cls)) return null
      if (!el || !el.matches(':focus-visible')) return null
      const focused = getComputedStyle(el).boxShadow
      const outlineStyle = getComputedStyle(el).outlineStyle
      ;(el as HTMLElement).blur()
      const blurred = getComputedStyle(el).boxShadow
      return { focused, blurred, outlineStyle }
    })
    if (r) return r
  }
  return null
}

test.describe('convención de foco (runtime)', () => {
  test('el token .focus-ring DIBUJA el anillo al foco por teclado', async ({ page }) => {
    await openPdfEditor(page)
    const r = await focusFirstRingControl(page)
    expect(r, 'no se alcanzó un control .focus-ring por teclado').not.toBeNull()
    expect(r?.outlineStyle).toBe('none') // el token suprime el outline global
    expect(r?.focused).not.toBe('none') // ...y dibuja el anillo
    expect(r?.focused).not.toBe(r?.blurred) // el :focus-visible lo AGREGA
  })

  test('el anillo ADAPTA su color en modo oscuro', async ({ page }) => {
    await openPdfEditor(page)
    const light = await focusFirstRingControl(page)
    expect(light, 'no se alcanzó control .focus-ring en claro').not.toBeNull()
    // La app marca el tema con html.dark; el token usa var(--accent-primary),
    // que cambia en oscuro → el box-shadow resuelto debe diferir del de claro.
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const dark = await focusFirstRingControl(page)
    expect(dark, 'no se alcanzó control .focus-ring en oscuro').not.toBeNull()
    expect(dark?.focused).not.toBe('none')
    expect(dark?.focused).not.toBe(light?.focused)
  })

  test('un control SIN token cae en el outline global *:focus-visible', async ({
    page,
  }) => {
    await openPdfEditor(page)
    // Tabula hasta un focusable que NO usa el token: debe mostrar el outline
    // global (outline-style: solid), no estar sin indicador.
    let outline = null
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab')
      outline = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body || !el.matches(':focus-visible')) return null
        const cs = getComputedStyle(el)
        if (cs.outlineStyle === 'none') return null // saltamos tokens/exentos
        return { style: cs.outlineStyle, width: cs.outlineWidth }
      })
      if (outline) break
    }
    expect(outline, 'ningún control cayó en el outline global').not.toBeNull()
    expect(outline?.style).toBe('solid')
  })

  test('los tokens de SELECCIÓN renderizan su anillo (salvia y oro, distintos)', async ({
    page,
  }) => {
    await mockBackend(page, emptyState())
    await enableDemoMode(page)
    await page.goto('/')
    const shadows = await page.evaluate(() => {
      const mk = (cls: string) => {
        const el = document.createElement('div')
        el.className = cls
        document.body.appendChild(el)
        const s = getComputedStyle(el).boxShadow
        el.remove()
        return s
      }
      return { sage: mk('selection-ring'), gold: mk('selection-ring-gold') }
    })
    expect(shadows.sage).not.toBe('none')
    expect(shadows.gold).not.toBe('none')
    expect(shadows.sage).not.toBe(shadows.gold) // colores semánticos distintos
  })

  test('el token .focus-ring-within ilumina el wrapper al enfocar un hijo', async ({
    page,
  }) => {
    await mockBackend(page, emptyState())
    await enableDemoMode(page)
    await page.goto('/')
    const shadow = await page.evaluate(() => {
      const wrap = document.createElement('div')
      wrap.className = 'focus-ring-within'
      const input = document.createElement('input')
      wrap.appendChild(input)
      document.body.appendChild(wrap)
      input.focus() // :focus-within matchea con foco programático del hijo
      const s = getComputedStyle(wrap).boxShadow
      wrap.remove()
      return s
    })
    expect(shadow).not.toBe('none')
  })

  test('en forced-colors el foco cae en un outline visible (no box-shadow)', async ({
    page,
  }) => {
    // En alto contraste el navegador descarta box-shadow; el fallback de
    // index.css restaura un outline para que el foco siga siendo visible.
    await page.emulateMedia({ forcedColors: 'active' })
    await openPdfEditor(page)
    const r = await focusFirstRingControl(page)
    expect(r, 'no se alcanzó control .focus-ring en forced-colors').not.toBeNull()
    expect(r?.outlineStyle).toBe('solid')
  })
})
