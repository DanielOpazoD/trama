/**
 * Smoke tests para MomentoComposer. El componente es presentación pura
 * — todo el state vive en `useMomentoComposer` (con tests propios) —
 * así que acá solo testeamos las branches por `kind`, el dispatch a
 * los callbacks del composer, y el QR button condicional.
 *
 * Mockeamos el composer entero como un objeto con las props/methods
 * que el componente lee. Eso evita levantar todo el stack de queries
 * + toast + state para un test que solo verifica el rendering.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// El editor de imágenes es perezoso/browser-only: lo mockeamos para verificar el
// cableado del botón "editar" sin montar canvas.
const editorMock = vi.hoisted(() => ({ editImage: vi.fn() }))
vi.mock('../../lib/imageEditor', () => ({ editImage: editorMock.editImage }))

import { MomentoComposer } from './MomentoComposer'
import type { useMomentoComposer } from './useMomentoComposer'

type Composer = ReturnType<typeof useMomentoComposer>

function makeComposer(overrides: Partial<Composer> = {}): Composer {
  // Mock minimal del composer. Solo poblamos los campos que el
  // componente lee (verificado por TS al castear al final).
  // Todos los string-trim/length se aseguran inicializados con '' / [].
  const base = {
    kind: 'nota' as const,
    setKind: vi.fn(),
    submit: vi.fn(),
    isPending: false,
    photoUploading: false,
    previewing: false,
    fetchPreview: vi.fn(),
    photoUploadProgress: 0,
    // Nota
    noteDraft: '',
    setNoteDraft: vi.fn(),
    // Recorte
    recorteUrl: '',
    setRecorteUrl: vi.fn(),
    recorteTitle: '',
    setRecorteTitle: vi.fn(),
    recorteAuthor: '',
    setRecorteAuthor: vi.fn(),
    recorteBody: '',
    setRecorteBody: vi.fn(),
    recorteSource: '',
    setRecorteSource: vi.fn(),
    recorteNote: '',
    setRecorteNote: vi.fn(),
    // Foto
    photoDrafts: [],
    addPhotoFiles: vi.fn(),
    removePhotoDraft: vi.fn(),
    setPrimaryPhoto: vi.fn(),
    movePhoto: vi.fn(),
    photoCaption: '',
    setPhotoCaption: vi.fn(),
    photoNote: '',
    setPhotoNote: vi.fn(),
    ...overrides,
  } as unknown as Composer
  return base
}

describe('<MomentoComposer />', () => {
  it('renderiza el header con el copy del kind activo (nota)', () => {
    const composer = makeComposer({ kind: 'nota' })
    render(<MomentoComposer composer={composer} />)
    expect(screen.getByText(/¿Qué viste, leíste o pensaste hoy/i)).toBeInTheDocument()
  })

  it('renderiza el header del kind recorte', () => {
    const composer = makeComposer({ kind: 'recorte' })
    render(<MomentoComposer composer={composer} />)
    expect(
      screen.getByText(/Algo del mundo que te llamó la atención/i),
    ).toBeInTheDocument()
  })

  it('renderiza el header del kind foto', () => {
    const composer = makeComposer({ kind: 'foto' })
    render(<MomentoComposer composer={composer} />)
    expect(screen.getByText(/Una imagen del día/i)).toBeInTheDocument()
  })

  it('el botón QR solo aparece en kind=foto', () => {
    const { rerender } = render(
      <MomentoComposer composer={makeComposer({ kind: 'nota' })} />,
    )
    expect(screen.queryByLabelText(/abrir en el celular/i)).toBeNull()
    rerender(<MomentoComposer composer={makeComposer({ kind: 'foto' })} />)
    expect(screen.getByLabelText(/abrir en el celular/i)).toBeInTheDocument()
  })

  it('submit del form llama composer.submit()', async () => {
    const submit = vi.fn()
    render(<MomentoComposer composer={makeComposer({ submit })} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /guardar/i }))
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('label del botón cambia a "guardando…" cuando isPending', () => {
    render(<MomentoComposer composer={makeComposer({ isPending: true })} />)
    expect(screen.getByRole('button', { name: /guardando/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guardando/i })).toBeDisabled()
  })

  it('label del botón cambia a "subiendo…" cuando photoUploading', () => {
    render(
      <MomentoComposer composer={makeComposer({ kind: 'foto', photoUploading: true })} />,
    )
    expect(screen.getByRole('button', { name: /subiendo/i })).toBeInTheDocument()
  })

  it('el botón "editar" del tile pasa la foto por el editor y reemplaza el draft', async () => {
    const draftFile = new File(['orig'], 'orig.jpg', { type: 'image/jpeg' })
    const edited = new File(['edit'], 'orig.jpg', { type: 'image/jpeg' })
    editorMock.editImage.mockResolvedValue(edited)
    const replacePhotoDraft = vi.fn()
    const composer = makeComposer({
      kind: 'foto',
      photoDrafts: [{ file: draftFile, previewUrl: 'blob:orig' }],
      replacePhotoDraft,
    } as Partial<Composer>)

    render(<MomentoComposer composer={composer} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /editar foto 1/i }))

    expect(editorMock.editImage).toHaveBeenCalledWith(
      draftFile,
      expect.objectContaining({ outputType: 'image/jpeg' }),
    )
    await waitFor(() => expect(replacePhotoDraft).toHaveBeenCalledWith(0, edited))
  })
})
