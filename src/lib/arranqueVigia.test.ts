import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `public/arranque-vigia.js` no pasa por el bundler —ése es el punto: tiene
 * que sobrevivir a un fallo del bundle— así que aquí se lee del disco y se
 * evalúa igual que lo haría el navegador.
 */
const FUENTE = readFileSync(join(process.cwd(), 'public/arranque-vigia.js'), 'utf8')
const PANEL = '#trama-arranque-fallido'

function armarVigia() {
  new Function(FUENTE)()
}

function montarApp() {
  const nodo = document.createElement('main')
  nodo.textContent = 'la app'
  document.getElementById('root')?.appendChild(nodo)
}

describe('vigía de arranque', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="root"></div>'
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('con #root vacío al vencer el plazo, explica el fallo y ofrece recargar', () => {
    const beacon = vi.fn(() => true)
    vi.stubGlobal('navigator', Object.assign(navigator, { sendBeacon: beacon }))

    armarVigia()
    expect(document.querySelector(PANEL)).toBeNull()

    vi.advanceTimersByTime(10_000)

    const panel = document.querySelector(PANEL)
    expect(panel).not.toBeNull()
    expect(panel?.getAttribute('role')).toBe('alert')
    expect(panel?.textContent).toContain('Trama no llegó a abrirse')
    expect(panel?.querySelector('button')?.textContent).toBe('Recargar')
    // Y deja rastro en el servidor: una pantalla en blanco no puede ser muda.
    expect(beacon).toHaveBeenCalledWith('/api/error-log', expect.anything())
  })

  it('si la app monta antes del plazo, no aparece nada', async () => {
    armarVigia()
    montarApp()
    await Promise.resolve()

    vi.advanceTimersByTime(60_000)
    expect(document.querySelector(PANEL)).toBeNull()
  })

  it('si la app monta tarde, el panel ya puesto se retira', async () => {
    armarVigia()
    vi.advanceTimersByTime(10_000)
    expect(document.querySelector(PANEL)).not.toBeNull()

    montarApp()
    await vi.waitFor(() => expect(document.querySelector(PANEL)).toBeNull())
  })

  it('sin #root no hace nada (una página que no es la app)', () => {
    document.body.innerHTML = '<p>otra cosa</p>'
    expect(() => armarVigia()).not.toThrow()
    vi.advanceTimersByTime(60_000)
    expect(document.querySelector(PANEL)).toBeNull()
  })
})
