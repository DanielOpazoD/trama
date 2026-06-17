import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { RecorteCard } from './RecorteCard'
import type { Recorte } from '../../api'
import { renderWithProviders } from '../../test-utils'

vi.mock('../../state', async (importActual) => {
  const actual = await importActual<typeof import('../../state')>()
  return {
    ...actual,
    useSuggestRecorte: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateRecorte: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useToast: () => ({ show: vi.fn() }),
  }
})

const LONG_TEXT = Array.from(
  { length: 36 },
  (_, i) => `Linea extensa ${i + 1}: una captura larga que no debe ocupar toda la lista.`,
).join('\n')

const RECORTE: Recorte = {
  id: 'r1',
  text: LONG_TEXT,
  sourceUrl: 'https://example.com/nota',
  sourceTitle: 'Captura larga',
  sourceAuthor: null,
  note: null,
  imageUrl: null,
  imageKey: null,
  images: [],
  captureMode: 'article',
  captureSource: null,
  status: 'pending',
  promotedTarget: null,
  promotedId: null,
  capturedAt: null,
  createdAt: '2026-06-17T10:00:00.000Z',
  updatedAt: '2026-06-17T10:00:00.000Z',
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return this.textContent && this.textContent.length > 400 ? 520 : 0
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('<RecorteCard />', () => {
  it('colapsa capturas largas con un control compacto sobre el fade, no con una franja gigante', async () => {
    renderWithProviders(
      <RecorteCard
        recorte={RECORTE}
        onPromote={() => {}}
        onArchive={() => {}}
        onRestore={() => {}}
        onDelete={() => {}}
      />,
    )

    const expand = await screen.findByRole('button', {
      name: 'Leer la captura completa',
    })
    const control = screen.getByTestId('recorte-collapse-control')

    expect(expand).toHaveClass('h-7', 'w-7')
    expect(control).toHaveClass('absolute', 'bottom-1')
  })
})
