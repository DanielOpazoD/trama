import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageEditorModal } from './ImageEditorModal'

// rasterize toca canvas/createImageBitmap (browser-only): lo neutralizamos.
vi.mock('../../lib/imageEditor/raster', () => ({
  rasterize: vi.fn(async (f: File) => f),
}))

describe('<ImageEditorModal />', () => {
  afterEach(() => vi.restoreAllMocks())

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
})
