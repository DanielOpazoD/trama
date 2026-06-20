import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfStudioStampAsset } from '../../../../lib/pdfStudio/stamps/stampAssets'
import { StampAssetMenu } from './StampAssetMenu'

const pngSrc =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
const originalPrompt = window.prompt

function asset(
  id: string,
  kind: PdfStudioStampAsset['kind'],
  name: string,
  lastUsedAt: number,
): PdfStudioStampAsset {
  return {
    id,
    kind,
    name,
    src: pngSrc,
    mimeType: 'image/png',
    width: 320,
    height: 160,
    createdAt: lastUsedAt - 10,
    updatedAt: lastUsedAt - 10,
    lastUsedAt,
  }
}

function setup(overrides: Partial<Parameters<typeof StampAssetMenu>[0]> = {}) {
  const props: Parameters<typeof StampAssetMenu>[0] = {
    assets: [],
    onCreateFromFile: vi.fn(),
    onCreateSignatureFromDataUrl: vi.fn(),
    onDelete: vi.fn(),
    onRename: vi.fn(),
    onUse: vi.fn(),
    ...overrides,
  }
  render(<StampAssetMenu {...props} />)
  return props
}

describe('<StampAssetMenu />', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    if (originalPrompt === undefined) {
      Reflect.deleteProperty(window, 'prompt')
      return
    }
    Object.defineProperty(window, 'prompt', {
      value: originalPrompt,
      configurable: true,
      writable: true,
    })
  })

  it('abre un menú compacto con estados vacíos para firmas y timbres', () => {
    setup()

    fireEvent.click(screen.getByRole('button', { name: 'Firma y timbre' }))

    expect(screen.getByRole('menu')).toHaveClass('z-[80]')
    expect(screen.getByRole('tab', { name: 'Firmas' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('Aún no guardas firmas.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir firma' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dibujar firma' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Timbres' }))
    expect(screen.getByText('Aún no guardas timbres.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir timbre' })).toBeInTheDocument()
  })

  it('permite insertar un asset guardado y expone acciones de administración', () => {
    const prompt = vi.fn(() => 'Firma legal')
    Object.defineProperty(window, 'prompt', {
      value: prompt,
      configurable: true,
    })
    const props = setup({
      assets: [
        asset('sig-1', 'signature', 'Firma Daniel', 200),
        asset('stamp-1', 'stamp', 'Timbre Clínica', 300),
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Firma y timbre' }))
    fireEvent.click(screen.getByRole('button', { name: 'Insertar Firma Daniel' }))

    expect(props.onUse).toHaveBeenCalledWith(expect.objectContaining({ id: 'sig-1' }))

    fireEvent.click(screen.getByRole('button', { name: 'Firma y timbre' }))
    fireEvent.click(screen.getByRole('button', { name: 'Renombrar Firma Daniel' }))
    expect(props.onRename).toHaveBeenCalledWith('sig-1', 'Firma legal')

    fireEvent.click(screen.getByRole('button', { name: 'Firma y timbre' }))
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Firma Daniel' }))
    expect(props.onDelete).toHaveBeenCalledWith('sig-1')
  })

  it('muestra recientes mezclando firmas y timbres por último uso', () => {
    setup({
      assets: [
        asset('sig-1', 'signature', 'Firma antigua', 100),
        asset('stamp-1', 'stamp', 'Timbre reciente', 300),
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Firma y timbre' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Recientes' }))

    const buttons = screen.getAllByRole('button', { name: /Insertar/i })
    expect(buttons[0]).toHaveAccessibleName('Insertar Timbre reciente')
    expect(buttons[1]).toHaveAccessibleName('Insertar Firma antigua')
  })

  it('restaura el prompt global después de los tests que lo mockean', () => {
    expect(window.prompt).toBe(originalPrompt)
  })
})
