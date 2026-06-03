import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageEditorModal } from './ImageEditorModal'
import { rasterize } from '../../lib/imageEditor/raster'

// rasterize toca canvas/createImageBitmap (browser-only): lo neutralizamos.
vi.mock('../../lib/imageEditor/raster', () => ({
  rasterize: vi.fn(async (f: File) => f),
}))

// new Image() no dispara onload en el entorno de test → stub que reporta
// dimensiones, así el botón "listo" deja de estar deshabilitado.
class FakeImage {
  onload: (() => void) | null = null
  naturalWidth = 800
  naturalHeight = 600
  set src(_v: string) {
    if (this.onload) setTimeout(() => this.onload?.(), 0)
  }
}

describe('<ImageEditorModal />', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function setup() {
    const onResolve = vi.fn()
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    render(
      <ImageEditorModal
        file={file}
        options={{ title: 'foto 1' }}
        onResolve={onResolve}
      />,
    )
    return { onResolve }
  }

  it('renderiza el diálogo con las tres herramientas y el footer', () => {
    setup()
    expect(
      screen.getByRole('dialog', { name: /editor de imágenes/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^recortar$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^girar$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^texto$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^listo$/i })).toBeInTheDocument()
  })

  it('cancelar resuelve con null', () => {
    const { onResolve } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }))
    expect(onResolve).toHaveBeenCalledWith(null)
  })

  it('"Texto" agrega una capa y muestra sus controles (fuente/tamaño/color)', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /^texto$/i }))
    expect(screen.getByLabelText('Texto')).toBeInTheDocument() // input de contenido
    expect(screen.getByRole('radiogroup', { name: /fuente/i })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: /tamaño/i })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: /color/i })).toBeInTheDocument()
  })

  it('"listo" rasteriza y resuelve con el File resultante', async () => {
    vi.stubGlobal('Image', FakeImage)
    const { onResolve } = setup()
    const listo = screen.getByRole('button', { name: /^listo$/i })
    // Espera a que la imagen "cargue" (onload del stub) → se habilita "listo".
    await waitFor(() => expect(listo).not.toBeDisabled())
    fireEvent.click(listo)
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1))
    expect(rasterize).toHaveBeenCalled()
    expect(onResolve).toHaveBeenCalledWith(expect.any(File))
  })
})
