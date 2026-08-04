import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NotasImprentaSelectionBar } from './NotasImprentaSelectionBar'
import type { CaptureItem } from '../../api'
import type { Note } from '../../api/notes'

function notaItem(id: string, hasImages: boolean): CaptureItem {
  return { type: 'note', id, note: { id, hasImages } as Note } as CaptureItem
}

describe('<NotasImprentaSelectionBar />', () => {
  it('distingue seleccionadas de "con fotos" y envía SOLO las que aportan', async () => {
    const onSendToImprenta = vi.fn(async (_items: CaptureItem[]) => {})
    const onClear = vi.fn()
    render(
      <NotasImprentaSelectionBar
        selectedItems={[
          notaItem('n1', true),
          notaItem('n2', false),
          notaItem('n3', true),
        ]}
        onClear={onClear}
        onSendToImprenta={onSendToImprenta}
      />,
    )

    // El déficit se dice ANTES de enviar, no después con un éxito parcial.
    expect(screen.getByText(/3 seleccionadas/)).toBeInTheDocument()
    expect(screen.getByText(/2 con fotos/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /fotos a imprenta/i }))
    await waitFor(() => expect(onClear).toHaveBeenCalled())
    expect(onSendToImprenta).toHaveBeenCalledTimes(1)
    expect(onSendToImprenta.mock.calls[0]![0].map((i) => i.id)).toEqual(['n1', 'n3'])
  })

  it('sin fotos en la selección, el envío queda deshabilitado', () => {
    render(
      <NotasImprentaSelectionBar
        selectedItems={[notaItem('n1', false)]}
        onClear={() => {}}
        onSendToImprenta={async () => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /fotos a imprenta/i })).toBeDisabled()
  })
})
