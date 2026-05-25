/**
 * DD8: tests del PreviewBanner (DD1).
 *
 * Lógica simple, pero la regresión silenciaría todo el aviso de la
 * BD efímera de previews — vale la pena cubrirlo.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PreviewBanner } from './PreviewBanner'

const ORIGINAL_LOCATION = window.location

function setHostname(hostname: string) {
  // happy-dom permite reasignar window.location en runtime.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname },
  })
}

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  window.sessionStorage.clear()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: ORIGINAL_LOCATION,
  })
})

describe('PreviewBanner', () => {
  it('NO se renderiza en producción (hostname normal)', () => {
    setHostname('tramadaod.netlify.app')
    const { container } = render(<PreviewBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('se renderiza en deploy preview (hostname matches pattern)', () => {
    setHostname('deploy-preview-42--tramadaod.netlify.app')
    render(<PreviewBanner />)
    expect(screen.getByText(/deploy preview/i)).toBeInTheDocument()
    expect(screen.getByText(/BD efímera/i)).toBeInTheDocument()
  })

  it('desaparece al click en "entendido" y persiste la dismissal', () => {
    setHostname('deploy-preview-7--tramadaod.netlify.app')
    const { rerender, container } = render(<PreviewBanner />)
    expect(screen.getByText(/deploy preview/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /ocultar banner/i }))

    // Re-render: el banner permanece oculto porque sessionStorage tiene la marca.
    rerender(<PreviewBanner />)
    expect(container.firstChild).toBeNull()
    expect(window.sessionStorage.getItem('trama:preview-banner-dismissed')).toBe('1')
  })

  it('respeta dismissal previa al montar', () => {
    setHostname('deploy-preview-99--tramadaod.netlify.app')
    window.sessionStorage.setItem('trama:preview-banner-dismissed', '1')
    const { container } = render(<PreviewBanner />)
    expect(container.firstChild).toBeNull()
  })
})
