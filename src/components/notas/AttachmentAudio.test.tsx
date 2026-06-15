import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotasAttachment } from '../../api'
import { AttachmentAudio } from './AttachmentAudio'

const stateMocks = vi.hoisted(() => ({ useNotasAttachmentsQuery: vi.fn() }))
vi.mock('../../state', () => stateMocks)
vi.mock('../momentos/AudioNote', () => ({
  AudioNote: ({ src }: { src: string }) => <div data-testid="audio" data-src={src} />,
}))

function attachment(over: Partial<NotasAttachment>): NotasAttachment {
  return {
    id: 'a',
    ownerType: 'note',
    ownerId: 'n1',
    fileName: 'x',
    mimeType: 'audio/ogg',
    byteSize: 1,
    storageKey: 'u/x.ogg',
    url: '/api/notas-attachments-file/u/x.ogg',
    createdAt: '',
    updatedAt: '',
    ...over,
  }
}

describe('<AttachmentAudio />', () => {
  beforeEach(() => stateMocks.useNotasAttachmentsQuery.mockReset())

  it('reproduce solo los anexos de audio (ignora imágenes)', () => {
    stateMocks.useNotasAttachmentsQuery.mockReturnValue({
      data: [
        attachment({ id: 'img', mimeType: 'image/png' }),
        attachment({
          id: 'voz',
          mimeType: 'audio/ogg',
          url: '/api/notas-attachments-file/u/voz.ogg',
        }),
      ],
    })
    render(<AttachmentAudio ownerType="note" ownerId="n1" />)
    const players = screen.getAllByTestId('audio')
    expect(players).toHaveLength(1)
    expect(players[0]).toHaveAttribute(
      'data-src',
      '/api/notas-attachments-file/u/voz.ogg',
    )
  })

  it('no renderiza nada si no hay audio', () => {
    stateMocks.useNotasAttachmentsQuery.mockReturnValue({
      data: [attachment({ mimeType: 'image/png' })],
    })
    const { container } = render(<AttachmentAudio ownerType="note" ownerId="n1" />)
    expect(container).toBeEmptyDOMElement()
  })
})
