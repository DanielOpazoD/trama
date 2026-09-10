import type { ReactNode } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { NotasWorld } from './NotasWorld'
import {
  handOffFilesToImprenta,
  takeHandedOffImprentaFiles,
} from '../../lib/imprentaHandoff'

const pdfStudioModule = vi.hoisted(() => ({
  loaded: vi.fn(),
}))

vi.mock('./pdfStudio/PdfStudioView', () => {
  pdfStudioModule.loaded()
  return {
    // Pinta `topBar` como el estudio real: el título de la sección vive ahí, y
    // «drena» lo afirma.
    PdfStudioView: ({
      onGoToSection,
      topBar,
    }: {
      onGoToSection?: (section: string) => void
      topBar?: ReactNode
    }) => (
      <>
        {topBar}
        <div>PDF Studio mock</div>
        <button type="button" onClick={() => onGoToSection?.('biblioteca')}>
          camino a biblioteca
        </button>
      </>
    ),
  }
})

vi.mock('./NotasFeedView', () => ({
  NotasFeedView: ({ onOpenSettings }: { onOpenSettings?: (section: string) => void }) => (
    <>
      <div role="tablist" aria-label="Feed mock">
        <button type="button" role="tab">
          Capturas
        </button>
        <button type="button" role="tab">
          Favoritos
        </button>
      </div>
      <button type="button" onClick={() => onOpenSettings?.('extension')}>
        configurar extensión
      </button>
    </>
  ),
}))

vi.mock('../CommandPalette', () => ({
  CommandPalette: ({
    onClose,
    onNavigate,
    onRevealNotasModule,
    onAction,
    contentSource,
  }: {
    onClose: () => void
    onNavigate: (view: string) => void
    onRevealNotasModule?: (section: string) => void
    onAction?: (action: string) => void
    contentSource?: unknown
  }) => (
    <section aria-label="paleta mock">
      {contentSource ? 'con contenido de Notas' : 'sin contenido'}
      <button type="button" onClick={() => onRevealNotasModule?.('tareas')}>
        paleta tareas
      </button>
      <button type="button" onClick={() => onAction?.('open-settings')}>
        paleta configuración
      </button>
      <button type="button" onClick={() => onNavigate('grafo')}>
        paleta grafo
      </button>
      <button type="button" onClick={onClose}>
        cerrar paleta
      </button>
    </section>
  ),
}))

vi.mock('../Settings', () => ({
  Settings: ({
    open,
    onClose,
    initialSection,
  }: {
    open: boolean
    onClose: () => void
    initialSection?: string
  }) =>
    open ? (
      <section aria-label="settings mock">
        settings {initialSection ?? 'none'}
        <button type="button" onClick={onClose}>
          cerrar settings
        </button>
      </section>
    ) : null,
}))

beforeEach(() => {
  pdfStudioModule.loaded.mockClear()
  window.localStorage.clear()
  // Notas y Tareas piden sus listas al montar; devolvemos [] (vacío).
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('<NotasWorld />', () => {
  it('muestra una barra superior equivalente al mundo principal', () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Inicio' }).closest('.animate-shell-topbar'),
    ).toBeNull()
    expect(screen.getAllByText('mundo notas').length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByRole('button', { name: 'Prompts' })[0]!)

    // Dos headings: el h1 del topbar y el h2 editorial del ViewHeader.
    expect(screen.getAllByRole('heading', { name: 'Prompts' })).toHaveLength(2)
    expect(screen.getAllByText('biblioteca reutilizable').length).toBeGreaterThan(0)
  })

  it('arranca en Inicio y navega a Tareas', () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)
    expect(screen.getAllByRole('button', { name: 'Inicio' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Tareas' })[0]!)
    expect(screen.getAllByRole('heading', { name: 'Tareas' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('recordatorios de la semana').length).toBeGreaterThan(0)
  })

  it('respeta initialSection para abrir una sección real sin depender de localStorage', () => {
    renderWithProviders(
      <NotasWorld world="notas" initialSection="prompts" onChangeWorld={() => {}} />,
    )

    expect(screen.getAllByRole('button', { name: 'Prompts' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getAllByRole('heading', { name: 'Prompts' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('biblioteca reutilizable').length).toBeGreaterThan(0)
  })

  it('monta el feed unificado (con su control segmentado) en la sección Notas', async () => {
    renderWithProviders(
      <NotasWorld world="notas" initialSection="notas" onChangeWorld={() => {}} />,
    )

    expect(screen.getAllByRole('button', { name: 'Notas' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )

    // El feed expone el control segmentado Todo · Escritas · Capturas · Favoritos.
    expect(await screen.findByRole('tab', { name: 'Capturas' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Favoritos' })).toBeInTheDocument()
  })

  it('monta con una sección oculta sin romper (regresión TDZ en producción)', () => {
    // El espejo de prefs hidrata SÍNCRONO en el primer render: con un módulo
    // oculto, el filter de secciones evalúa `s.id === section` en ese mismo
    // render. Antes del fix, `section` se declaraba después del filter →
    // ReferenceError ("Cannot access 'section' before initialization").
    window.localStorage.setItem(
      'trama:user-prefs',
      JSON.stringify({ owner: null, prefs: { visibleModules: { claves: false } } }),
    )
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument()
    // La sección oculta no aparece en el nav; el resto sí.
    expect(screen.queryByRole('button', { name: 'Claves' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Notas' }).length).toBeGreaterThan(0)
  })

  it('no muestra controles de modo cómodo ni compacto', () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)

    expect(screen.queryByRole('button', { name: 'Modo cómodo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Modo compacto' })).toBeNull()
    expect(screen.getByTestId('notas-world-content')).toHaveClass('max-w-5xl')
  })

  it('permite colapsar y volver a expandir la barra lateral de Notas', () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Colapsar barra de Notas' }))

    expect(
      screen.getByRole('button', { name: 'Expandir barra de Notas' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expandir barra de Notas' }))

    expect(
      screen.getByRole('button', { name: 'Colapsar barra de Notas' }),
    ).toBeInTheDocument()
  })

  it('el buscador es la paleta de los dos mundos, con el contenido de Notas', async () => {
    const onGoToTrama = vi.fn()
    renderWithProviders(
      <NotasWorld world="notas" onChangeWorld={() => {}} onGoToTrama={onGoToTrama} />,
    )
    expect(screen.queryByRole('button', { name: 'Buscar en Notas' })).toBeNull()

    fireEvent.click(screen.getAllByRole('button', { name: /^Buscar \(/ })[0]!)
    const paleta = await screen.findByRole('region', { name: 'paleta mock' })
    expect(paleta).toHaveTextContent('con contenido de Notas')

    fireEvent.click(screen.getByRole('button', { name: 'paleta grafo' }))
    expect(onGoToTrama).toHaveBeenCalledWith({ kind: 'view', view: 'grafo' })

    fireEvent.click(screen.getByRole('button', { name: 'paleta tareas' }))
    expect(screen.getAllByRole('button', { name: 'Tareas' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )

    fireEvent.click(screen.getByRole('button', { name: 'paleta configuración' }))
    expect(
      await screen.findByRole('region', { name: 'settings mock' }),
    ).toBeInTheDocument()
  })

  it('abierto con Configuración a la vista, el buscador queda encima', async () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Configuración/i })[0]!)
    const settings = await screen.findByRole('region', { name: 'settings mock' })

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const paleta = await screen.findByRole('region', { name: 'paleta mock' })
    // Comparten capa (z-40): queda encima el que va después en el DOM.
    expect(
      settings.compareDocumentPosition(paleta) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('⌘K abre y cierra el buscador fuera de los campos', async () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(await screen.findByRole('region', { name: 'paleta mock' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'paleta mock' })).toBeNull(),
    )
  })

  it('precarga PDF Studio por intención sobre Imprenta sin montarlo al iniciar', async () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)

    expect(pdfStudioModule.loaded).not.toHaveBeenCalled()
    fireEvent.mouseEnter(screen.getAllByRole('button', { name: 'Imprenta' })[0]!)

    await waitFor(() => expect(pdfStudioModule.loaded).toHaveBeenCalled())
  })

  it('drena los archivos que Momentos dejó en el puente y abre Imprenta', async () => {
    takeHandedOffImprentaFiles()
    handOffFilesToImprenta([new File(['x'], 'foto.jpg', { type: 'image/jpeg' })])

    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)

    // Arranca en Inicio; el drenaje al montar lleva a Imprenta con los
    // archivos. El toast lo pinta el host del shell, que aquí no está: la e2e
    // `momentos-a-imprenta` lo afirma en el navegador junto con las hojas.
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Imprenta', level: 1 }),
      ).toBeInTheDocument(),
    )
    // La cola quedó vacía: un segundo montaje no reenvía lo mismo.
    expect(takeHandedOffImprentaFiles()).toEqual([])
  })

  it('los caminos del vacío de Imprenta llevan a su sección', async () => {
    renderWithProviders(
      <NotasWorld world="notas" initialSection="pdf" onChangeWorld={() => {}} />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'camino a biblioteca' }))

    expect(screen.getAllByRole('button', { name: 'Biblioteca' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('el vacío de Favoritos abre Configuración en «Extensión», y cerrarla la olvida', async () => {
    renderWithProviders(
      <NotasWorld world="notas" initialSection="notas" onChangeWorld={() => {}} />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'configurar extensión' }))
    expect(await screen.findByText('settings extension')).toBeInTheDocument()

    // Abrirla después desde la barra no debe caer en la sección que pidió el vacío.
    fireEvent.click(screen.getByRole('button', { name: 'cerrar settings' }))
    fireEvent.click(screen.getAllByRole('button', { name: /^Configuración/ })[0]!)
    expect(await screen.findByText('settings none')).toBeInTheDocument()
  })
})
