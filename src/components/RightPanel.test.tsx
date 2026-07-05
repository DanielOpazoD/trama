import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ExtractionProposal } from '../types'
import { RightPanel } from './RightPanel'

vi.mock('./NodeDetailPanel', () => ({
  NodeDetailPanel: ({
    entityId,
    onClose,
    onOpenThread,
  }: {
    entityId: string
    onClose: () => void
    onOpenThread: (threadId: string) => void
  }) => (
    <section>
      <p>detalle {entityId}</p>
      <button onClick={onClose}>cerrar detalle</button>
      <button onClick={() => onOpenThread('thread-1')}>hablar</button>
    </section>
  ),
}))

vi.mock('./ProposalPanel', () => ({
  ProposalPanel: ({
    sourceText,
    onClose,
    onConfirmed,
  }: {
    sourceText: string
    onClose: () => void
    onConfirmed: () => void
  }) => (
    <section>
      <p>propuesta {sourceText}</p>
      <button onClick={onClose}>cerrar propuesta</button>
      <button onClick={onConfirmed}>confirmar propuesta</button>
    </section>
  ),
}))

// La pestaña minimizada resuelve la entidad del cache; sin backend, un stub.
vi.mock('../state', () => ({
  useEntitiesQuery: () => ({ data: [] }),
}))

const proposal = {} as ExtractionProposal

describe('<RightPanel />', () => {
  it('detalle minimizado muestra la pestaña y oculta el panel completo', () => {
    render(
      <RightPanel
        isMobile={false}
        pendingProposal={null}
        selectedEntityId="e1"
        minimized={true}
        onToggleMinimize={() => {}}
        onCloseProposal={() => {}}
        onCloseDetail={() => {}}
        onBackdropClose={() => {}}
        onOpenThreadFromDetail={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /abrir detalle/i })).toBeInTheDocument()
    expect(screen.queryByText('detalle e1')).not.toBeInTheDocument()
  })

  it('minimizado se ignora en la propuesta (pide decisión, se muestra completa)', () => {
    render(
      <RightPanel
        isMobile={false}
        pendingProposal={{ text: 'fuente', proposal }}
        selectedEntityId="e1"
        minimized={true}
        onToggleMinimize={() => {}}
        onCloseProposal={() => {}}
        onCloseDetail={() => {}}
        onBackdropClose={() => {}}
        onOpenThreadFromDetail={() => {}}
      />,
    )
    expect(screen.getByText('propuesta fuente')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /abrir detalle/i }),
    ).not.toBeInTheDocument()
  })

  it('no renderiza cuando no hay propuesta ni entidad', () => {
    render(
      <RightPanel
        isMobile={false}
        pendingProposal={null}
        selectedEntityId={null}
        minimized={false}
        onToggleMinimize={() => {}}
        onCloseProposal={() => {}}
        onCloseDetail={() => {}}
        onBackdropClose={() => {}}
        onOpenThreadFromDetail={() => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Cerrar panel' })).not.toBeInTheDocument()
  })

  it('prioriza propuesta pendiente sobre detalle y cierra desde acciones', async () => {
    const user = userEvent.setup()
    const onCloseProposal = vi.fn()
    const onBackdropClose = vi.fn()

    render(
      <RightPanel
        isMobile={false}
        pendingProposal={{ text: 'texto fuente', proposal }}
        selectedEntityId="e1"
        minimized={false}
        onToggleMinimize={() => {}}
        onCloseProposal={onCloseProposal}
        onCloseDetail={() => {}}
        onBackdropClose={onBackdropClose}
        onOpenThreadFromDetail={() => {}}
      />,
    )

    expect(screen.getByText('propuesta texto fuente')).toBeInTheDocument()
    expect(screen.queryByText(/detalle e1/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'confirmar propuesta' }))
    await user.click(screen.getByRole('button', { name: 'Cerrar panel' }))

    expect(onCloseProposal).toHaveBeenCalledOnce()
    expect(onBackdropClose).toHaveBeenCalledOnce()
  })

  it('muestra detalle y propaga abrir thread', async () => {
    const user = userEvent.setup()
    const onOpenThread = vi.fn()
    const onCloseDetail = vi.fn()

    render(
      <RightPanel
        isMobile
        pendingProposal={null}
        selectedEntityId="e1"
        minimized={false}
        onToggleMinimize={() => {}}
        onCloseProposal={() => {}}
        onCloseDetail={onCloseDetail}
        onBackdropClose={() => {}}
        onOpenThreadFromDetail={onOpenThread}
      />,
    )

    expect(screen.getByText('detalle e1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'hablar' }))
    await user.click(screen.getByRole('button', { name: 'cerrar detalle' }))

    expect(onOpenThread).toHaveBeenCalledWith('thread-1')
    expect(onCloseDetail).toHaveBeenCalledOnce()
  })
})
