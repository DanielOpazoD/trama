import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

vi.mock('../momentos/AuthenticatedMedia', () => ({
  useAuthenticatedMediaState: () => ({ src: 'blob:recorte', status: 'ready' }),
}))

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
  /**
   * El control de expandir era un disco flotante —borde, sombra y
   * `backdrop-blur`— posado sobre el degradado, mientras la nota usaba un
   * botón de texto en su pie: dos tratamientos distintos para lo mismo en el
   * mismo hilo, y el más pesado plantando cromo justo donde el ojo termina de
   * leer. Ahora ambos usan el mismo botón sobrio, en el flujo y sin adornos.
   */
  it('expande con el mismo botón sobrio que la nota, sin disco flotante', async () => {
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

    // El control es el propio botón, en el flujo del texto.
    expect(control).toBe(expand)
    expect(expand).toHaveTextContent('Leer más')
    expect(expand.className).not.toMatch(/rounded-full|shadow|backdrop-blur|border/)
    expect(expand.className).not.toMatch(/absolute/)
  })

  it('ofrece enviar imágenes internas a Imprenta desde el menú del recorte', async () => {
    const user = userEvent.setup()
    const onSendImagesToPdf = vi.fn()
    const imageRecorte = {
      ...RECORTE,
      text: 'Imagen desde WhatsApp',
      sourceTitle: 'recorte',
      imageKey: 'user/whatsapp.webp',
      images: [{ storageKey: 'user/whatsapp.webp' }],
      captureMode: 'image',
      captureSource: 'whatsapp',
    } satisfies Recorte

    renderWithProviders(
      <RecorteCard
        recorte={imageRecorte}
        onPromote={() => {}}
        onArchive={() => {}}
        onRestore={() => {}}
        onDelete={() => {}}
        onSendImagesToPdf={onSendImagesToPdf}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Acciones del recorte' }))
    await user.click(screen.getByRole('menuitem', { name: /Imprenta/i }))

    expect(onSendImagesToPdf).toHaveBeenCalledWith(imageRecorte)
  })
})
