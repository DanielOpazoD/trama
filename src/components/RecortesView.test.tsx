import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import RecortesView from './RecortesView'
import { makeQueryClient, renderWithProviders } from '../test-utils'
import { queryKeys } from '../state/queryClient'
import { recorteFromRow, type RecorteRow } from '../api/recortes'
import type { Recorte } from '../api'

/**
 * Smoke RTL de la bandeja de Recortes + test del transform snake↔camel.
 * El round-trip de promoción contra el server vive en demo/e2e; acá se
 * cubre el cableado UI: tarjetas, filtros, acciones y modal de revisión.
 */

const ROW: RecorteRow = {
  id: 'r1',
  text: 'La memoria es un taller.',
  source_url: 'https://example.com/x',
  source_title: 'El taller',
  source_author: 'Otra Parte',
  note: 'conecta con Borges',
  image_url: null,
  image_key: null,
  capture_mode: 'citation',
  status: 'pending',
  promoted_target: null,
  promoted_id: null,
  captured_at: '2026-06-10T12:00:00.000Z',
  created_at: '2026-06-10T12:00:00.000Z',
  updated_at: '2026-06-10T12:00:00.000Z',
}

function recorte(over: Partial<Recorte> = {}): Recorte {
  return { ...recorteFromRow(ROW), ...over }
}

function setup(recortes: Recorte[]) {
  const qc = makeQueryClient()
  qc.setQueryData(queryKeys.recortes, recortes)
  qc.setQueryData(queryKeys.entities, [])
  return renderWithProviders(<RecortesView />, { queryClient: qc })
}

describe('recorteFromRow', () => {
  it('transforma snake_case → camelCase completo', () => {
    expect(recorteFromRow(ROW)).toEqual({
      id: 'r1',
      text: 'La memoria es un taller.',
      sourceUrl: 'https://example.com/x',
      sourceTitle: 'El taller',
      sourceAuthor: 'Otra Parte',
      note: 'conecta con Borges',
      imageUrl: null,
      imageKey: null,
      captureMode: 'citation',
      status: 'pending',
      promotedTarget: null,
      promotedId: null,
      capturedAt: '2026-06-10T12:00:00.000Z',
      createdAt: '2026-06-10T12:00:00.000Z',
      updatedAt: '2026-06-10T12:00:00.000Z',
    })
  })
})

describe('<RecortesView />', () => {
  it('no carga entidades wholesale al abrir el modal de promoción', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/recortes/PromoteModal.tsx'),
      'utf8',
    )

    expect(source).not.toMatch(/\buseEntitiesQuery\b/)
  })

  it('muestra la tarjeta de prensa con fuente, marginalia y acciones', () => {
    setup([recorte()])
    expect(screen.getByRole('heading', { name: 'Recortes' })).toBeInTheDocument()
    expect(screen.getByText(/La memoria es un taller/)).toBeInTheDocument()
    expect(screen.getByText('conecta con Borges')).toBeInTheDocument()
    expect(screen.getByText(/ver original/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '→ cita' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '→ entidad' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '→ momento' })).toBeInTheDocument()
  })

  it('orienta la curaduría solo en recortes pendientes', () => {
    setup([
      recorte(),
      recorte({ id: 'r2', status: 'promoted', promotedTarget: 'quote', text: 'otro' }),
    ])

    expect(screen.getByLabelText('Siguiente curaduría')).toHaveTextContent(
      /pendiente de curaduría/i,
    )
    expect(screen.getByText(/elige si será cita, entidad o momento/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /promovidos/ }))

    expect(screen.queryByLabelText('Siguiente curaduría')).toBeNull()
  })

  it('mantiene visibles las acciones de la tarjeta en mobile/touch', () => {
    setup([recorte()])
    const actions = screen.getByRole('button', { name: 'archivar' }).parentElement

    expect(actions).toHaveClass('opacity-100')
    expect(actions).toHaveClass('sm:opacity-0')
    expect(actions).toHaveClass('sm:group-hover:opacity-100')
    expect(actions).toHaveClass('sm:focus-within:opacity-100')
  })

  it('renderiza la imagen del recorte cuando la hay (captura de imagen)', () => {
    setup([recorte({ imageUrl: 'https://example.com/foto.jpg' })])
    const img = document.querySelector('img[src="https://example.com/foto.jpg"]')
    expect(img).toBeInTheDocument()
  })

  it('limpia el Markdown crudo en la tarjeta de un artículo', () => {
    setup([
      recorte({
        captureMode: 'article',
        text: '## El cuaderno\n\n- uno\n\nLeé [esto](https://x.test) con **calma**.',
      }),
    ])
    // El encabezado se ve sin "##", la lista como viñeta, el enlace sin URL y
    // sin las comillas « » (es una página, no una cita).
    expect(screen.getByText(/El cuaderno/)).toBeInTheDocument()
    expect(screen.queryByText(/##/)).toBeNull()
    expect(screen.getByText(/Leé esto con calma/)).toBeInTheDocument()
    expect(screen.getByText(/• uno/)).toBeInTheDocument()
  })

  it('empty state invita a instalar la extensión', () => {
    setup([])
    expect(screen.getByText(/su primer recorte/)).toBeInTheDocument()
    expect(screen.getByText(/extensión de Trama/)).toBeInTheDocument()
  })

  it('los filtros separan pendientes de promovidos', () => {
    setup([
      recorte(),
      recorte({ id: 'r2', status: 'promoted', promotedTarget: 'quote', text: 'otro' }),
    ])
    expect(screen.getByText(/La memoria es un taller/)).toBeInTheDocument()
    expect(screen.queryByText('«otro»')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /promovidos/ }))
    expect(screen.getByText(/otro/)).toBeInTheDocument()
    expect(screen.getByText('→ cita')).toBeInTheDocument()
  })

  it('promover abre el modal de revisión con el texto editable', () => {
    setup([recorte()])
    fireEvent.click(screen.getByRole('button', { name: '→ momento' }))
    const dialog = screen.getByRole('dialog', { name: 'Promover a momento' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByDisplayValue('La memoria es un taller.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'crear momento' })).toBeEnabled()
  })

  it('promover atrapa el foco dentro del modal y lo restaura al cerrar', async () => {
    setup([recorte()])
    const trigger = screen.getByRole('button', { name: '→ momento' })
    trigger.focus()
    fireEvent.click(trigger)

    const textArea = screen.getByLabelText('Texto')
    await waitFor(() => expect(textArea).toHaveFocus())

    fireEvent.click(screen.getByRole('button', { name: 'cancelar' }))
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('archivar dispara el PATCH de estado', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ ...ROW, status: 'archived' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchSpy)
    setup([recorte()])
    fireEvent.click(screen.getByRole('button', { name: 'archivar' }))
    // La mutación postea en un microtask — esperar el fetch real.
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    vi.unstubAllGlobals()
  })

  it('sugerir muestra el banner de la IA y "usar sugerencia" pre-llena el modal', async () => {
    const suggestion = {
      target: 'quote',
      title: 'Sobre la memoria',
      rationale: 'Es una frase citable.',
      relatedEntityIds: ['e1'],
      suggestedEntityName: null,
      suggestedEntityType: null,
      relatedEntities: [{ id: 'e1', name: 'Borges', type: 'escritor' }],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | Request | URL) => {
        const url = String(input)
        if (url.includes('/suggest')) {
          return new Response(JSON.stringify(suggestion), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    )
    // Entidad existente para que el seed de la cita encuentre a Borges.
    const qc = makeQueryClient()
    qc.setQueryData(queryKeys.recortes, [recorte()])
    qc.setQueryData(queryKeys.entities, [
      {
        id: 'e1',
        name: 'Borges',
        type: 'escritor',
        origin: { kind: 'manual' },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])
    renderWithProviders(<RecortesView />, { queryClient: qc })

    fireEvent.click(screen.getByRole('button', { name: /sugerir/ }))
    expect(await screen.findByText(/la IA sugiere/i)).toBeInTheDocument()
    expect(screen.getByText(/Sobre la memoria/)).toBeInTheDocument()
    expect(screen.getByText(/Es una frase citable/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /usar sugerencia/ }))
    // El modal abre en "cita" y Borges queda pre-seleccionado.
    expect(screen.getByRole('dialog', { name: 'Promover a cita' })).toBeInTheDocument()
    expect(screen.getByText('Borges')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /atribuida/i })).toBeNull()
    vi.unstubAllGlobals()
  })
})
