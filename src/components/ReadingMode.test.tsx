import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReadingMode } from './ReadingMode'
import type { ExtractionProposal } from '../types'

const extractMock = vi.hoisted(() => vi.fn())

vi.mock('../api', () => ({
  api: {
    extract: extractMock,
  },
}))

const emptyProposal: ExtractionProposal = {
  entities: [],
  relationships: [],
  quotes: [],
}

describe('<ReadingMode />', () => {
  beforeEach(() => {
    extractMock.mockReset()
  })

  it('no renderiza cuando está cerrado', () => {
    render(<ReadingMode open={false} onClose={() => {}} onProposal={() => {}} />)

    expect(screen.queryByText('Pega un texto largo')).not.toBeInTheDocument()
  })

  it('procesa texto corto en una llamada y entrega la propuesta', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onProposal = vi.fn()
    extractMock.mockResolvedValue({
      ...emptyProposal,
      entities: [{ name: 'Borges', type: 'persona' }],
      provider: 'openai',
      model: 'gpt',
    })

    render(<ReadingMode open onClose={onClose} onProposal={onProposal} />)

    await user.type(screen.getByRole('textbox'), 'Un texto breve sobre Borges.')
    expect(screen.getByText(/una sola llamada al modelo/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'leer y proponer' }))

    await waitFor(() => {
      expect(onProposal).toHaveBeenCalledWith(
        'Un texto breve sobre Borges.',
        expect.objectContaining({
          entities: [expect.objectContaining({ name: 'Borges' })],
          provider: 'openai',
          model: 'gpt',
        }),
      )
    })
    expect(extractMock).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('divide textos largos y deduplica entidades, relaciones y citas', async () => {
    const user = userEvent.setup()
    const onProposal = vi.fn()
    const longText = `${'A'.repeat(2800)}\n\n${'B'.repeat(2800)}`
    extractMock
      .mockResolvedValueOnce({
        entities: [{ name: 'Borges', type: 'persona', description: 'uno' }],
        relationships: [{ fromName: 'Borges', toName: 'Bioy', type: 'amistad' }],
        quotes: [{ entityName: 'Borges', text: 'La biblioteca es total.' }],
        provider: 'openai',
        model: 'gpt-a',
      })
      .mockResolvedValueOnce({
        entities: [{ name: ' borges ', type: 'persona', description: 'dos' }],
        relationships: [{ fromName: 'borges', toName: 'Bioy', type: 'amistad' }],
        quotes: [{ entityName: 'Borges', text: 'La biblioteca es total. Extra' }],
        edits: [{ kind: 'entity', id: 'e1', name: 'Borges', patch: { year: 1899 } }],
        provider: 'openai',
        model: 'gpt-b',
      })

    render(<ReadingMode open onClose={() => {}} onProposal={onProposal} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: longText } })
    expect(screen.getByText(/2 llamadas al modelo/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'leer y proponer' }))

    await waitFor(() => {
      expect(onProposal).toHaveBeenCalled()
    })

    const [summary, proposal] = onProposal.mock.calls[0] as [string, ExtractionProposal]
    expect(summary).toMatch(/^2 fragmentos/)
    expect(extractMock).toHaveBeenCalledTimes(2)
    expect(proposal.entities).toHaveLength(1)
    expect(proposal.relationships).toHaveLength(1)
    expect(proposal.quotes).toHaveLength(2)
    expect(proposal.edits).toHaveLength(1)
    expect(proposal.model).toBe('gpt-b')
  })

  it('muestra errores de extracción y permite cerrar con Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    extractMock.mockRejectedValue(new Error('falló el modelo'))

    render(<ReadingMode open onClose={onClose} onProposal={() => {}} />)

    await user.type(screen.getByRole('textbox'), 'Texto listo para fallar')
    await user.click(screen.getByRole('button', { name: 'leer y proponer' }))

    expect(await screen.findByText('falló el modelo')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })
})
