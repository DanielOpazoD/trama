import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { BibliotecaView } from './BibliotecaView'
import { ToastHost } from './ToastHost'
import { renderWithProviders } from '../test-utils'

/**
 * Smoke tests para BibliotecaView. Ejercita el hook real (useBibliotecaList →
 * api.biblioteca.list → request → fetch stub), por lo que el fetch devuelve
 * filas snake_case como el endpoint. Verifica el cascarón (header + tabs), el
 * paso skeleton → lista, el estado vacío, el cambio de pestaña y el toggle de
 * orden al clickear un encabezado.
 */

type Row = {
  item_kind: string
  item_id: string
  title: string
  file_type: string
  source: string
  mime_type: string | null
  byte_size: number | null
  storage_key: string | null
  storage_domain: string
  tags: string[]
  pinned: boolean
  ai_status: string | null
  created_at: string
  updated_at: string
}

function row(partial: Partial<Row> & Pick<Row, 'item_id' | 'title'>): Row {
  return {
    item_kind: 'notas-attachment',
    file_type: 'document',
    source: 'subido',
    mime_type: 'application/pdf',
    byte_size: 1024,
    storage_key: `legacy/${partial.item_id}`,
    storage_domain: 'notas-attachments',
    tags: [],
    pinned: false,
    ai_status: null,
    created_at: '2026-06-19T10:00:00.000Z',
    updated_at: '2026-06-19T10:00:00.000Z',
    ...partial,
  }
}

function jsonResp(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Captura las URLs pedidas a /api/biblioteca para verificar params. */
let requestedUrls: string[] = []

function stubFetch(items: Row[], nextCursor: string | null = null) {
  requestedUrls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL) => {
      const url = String(input)
      // Registramos TODA URL pedida (no solo /api/biblioteca) para poder afirmar
      // que la subida NO se disparó en la guarda de tamaño.
      requestedUrls.push(url)
      if (url.includes('/api/biblioteca')) {
        return jsonResp({ items, nextCursor })
      }
      return jsonResp({ items: [], nextCursor: null })
    }),
  )
}

beforeEach(() => {
  // URL limpia: useSearchParamState lee de window.location en el mount.
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('<BibliotecaView />', () => {
  it('renderiza el header con título "Biblioteca" y las pestañas', async () => {
    stubFetch([])
    renderWithProviders(<BibliotecaView />)

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: 'Biblioteca' }),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: 'Todo', pressed: true }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Imágenes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archivos' })).toBeInTheDocument()
  })

  it('"Nuevo" está habilitado y abre el selector de archivos', async () => {
    stubFetch([])
    renderWithProviders(<BibliotecaView />)
    const nuevo = await screen.findByRole('button', { name: 'Nuevo' })
    // Ahora es funcional: subir archivos a la Biblioteca (no inerte).
    expect(nuevo).toBeEnabled()
    // Clickearlo dispara el click del input file oculto.
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).not.toBeNull()
    const clickSpy = vi.spyOn(fileInput!, 'click')
    fireEvent.click(nuevo)
    expect(clickSpy).toHaveBeenCalled()
  })

  it('pasa de skeleton a lista cuando la query resuelve', async () => {
    stubFetch([
      row({ item_id: 'a', title: 'Contrato.pdf', file_type: 'pdf' }),
      row({ item_id: 'b', title: 'Apuntes.docx', file_type: 'document' }),
    ])
    renderWithProviders(<BibliotecaView />)

    await waitFor(() => {
      expect(screen.getByText('Contrato.pdf')).toBeInTheDocument()
    })
    expect(screen.getByText('Apuntes.docx')).toBeInTheDocument()
    // Encabezados ordenables presentes (botón de orden por Nombre).
    expect(screen.getByRole('button', { name: /Nombre/i })).toBeInTheDocument()
  })

  it('muestra el estado vacío cuando no hay items', async () => {
    stubFetch([])
    renderWithProviders(<BibliotecaView />)
    await waitFor(() => {
      expect(screen.getByText(/No se encontraron archivos/i)).toBeInTheDocument()
    })
  })

  it('cambiar de pestaña actualiza el estado y la URL', async () => {
    stubFetch([row({ item_id: 'a', title: 'Foto.jpg', file_type: 'image' })])
    renderWithProviders(<BibliotecaView />)

    await screen.findByText('Foto.jpg')
    fireEvent.click(screen.getByRole('button', { name: 'Imágenes' }))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Imágenes', pressed: true }),
      ).toBeInTheDocument()
    })
    expect(window.location.search).toContain('tab=imagenes')
    // La query refetcheó con el tab nuevo.
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('tab=imagenes'))).toBe(true)
    })
  })

  it('clickear un encabezado de orden alterna asc/desc en la URL', async () => {
    stubFetch([row({ item_id: 'a', title: 'Contrato.pdf', file_type: 'pdf' })])
    renderWithProviders(<BibliotecaView />)

    await screen.findByText('Contrato.pdf')

    // El botón de orden de la columna Nombre. Lo re-consultamos en cada paso:
    // el re-render trae un onClick con el orden nuevo.
    const nombreSort = () => screen.getByRole('button', { name: /Nombre/i })

    // 1er click → nombre-asc (dirección natural de un nombre: A→Z). Cambiar el
    // orden cambia la queryKey, así que la lista pasa por skeleton; esperamos a
    // que la fila vuelva antes de volver a clickear.
    fireEvent.click(nombreSort())
    await waitFor(() => {
      expect(window.location.search).toContain('orden=nombre-asc')
    })
    await screen.findByText('Contrato.pdf')

    // 2do click → alterna a nombre-desc.
    fireEvent.click(nombreSort())
    await waitFor(() => {
      expect(window.location.search).toContain('orden=nombre-desc')
    })
  })

  it('muestra "Cargar más" cuando hay más páginas', async () => {
    stubFetch([row({ item_id: 'a', title: 'Contrato.pdf', file_type: 'pdf' })], '1')
    renderWithProviders(<BibliotecaView />)

    await screen.findByText('Contrato.pdf')
    expect(screen.getByRole('button', { name: /Cargar más/i })).toBeInTheDocument()
  })

  it('muestra la barra de controles: filtros + conmutador de vista', async () => {
    stubFetch([row({ item_id: 'a', title: 'Contrato.pdf', file_type: 'pdf' })])
    renderWithProviders(<BibliotecaView />)

    await screen.findByText('Contrato.pdf')
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeInTheDocument()
    // Lista activa por defecto; cuadrícula disponible.
    expect(
      screen.getByRole('button', { name: 'Lista', pressed: true }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Cuadrícula', pressed: false }),
    ).toBeInTheDocument()
  })

  it('cambiar a cuadrícula setea ?vista= y conmuta la vista renderizada', async () => {
    stubFetch([row({ item_id: 'a', title: 'Contrato.pdf', file_type: 'pdf' })])
    renderWithProviders(<BibliotecaView />)

    await screen.findByText('Contrato.pdf')
    // Lista: hay encabezado ordenable (role table). Cuadrícula: role list.
    expect(screen.getByRole('table', { name: 'Archivos' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cuadrícula' }))

    await waitFor(() => {
      expect(window.location.search).toContain('vista=cuadricula')
    })
    // La vista cambió a la cuadrícula (role list), ya no la tabla.
    expect(screen.getByRole('list', { name: 'Archivos' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Archivos' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Cuadrícula', pressed: true }),
    ).toBeInTheDocument()
  })

  it('seleccionar un Tipo en el popover setea ?tipo= y refetchea', async () => {
    stubFetch([row({ item_id: 'a', title: 'Contrato.pdf', file_type: 'pdf' })])
    renderWithProviders(<BibliotecaView />)

    await screen.findByText('Contrato.pdf')
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'PDF' }))

    await waitFor(() => {
      expect(window.location.search).toContain('tipo=pdf')
    })
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('tipo=pdf'))).toBe(true)
    })
  })

  it('seleccionar una Fuente en el popover setea ?fuente= y refetchea', async () => {
    stubFetch([row({ item_id: 'a', title: 'Contrato.pdf', file_type: 'pdf' })])
    renderWithProviders(<BibliotecaView />)

    await screen.findByText('Contrato.pdf')
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Subidos' }))

    await waitFor(() => {
      expect(window.location.search).toContain('fuente=subido')
    })
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('fuente=subido'))).toBe(true)
    })
  })

  // ---- Multi-select (PR-B) ----

  it('seleccionar items muestra la barra con el conteo; deseleccionar todo la cierra', async () => {
    stubFetch([
      row({ item_id: 'a', title: 'Foto uno.png', file_type: 'image' }),
      row({ item_id: 'b', title: 'Foto dos.png', file_type: 'image' }),
    ])
    renderWithProviders(<BibliotecaView />)

    await screen.findByText('Foto uno.png')
    // Sin selección no hay barra.
    expect(screen.queryByRole('toolbar', { name: /archivos seleccionados/i })).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Foto uno.png' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Foto dos.png' }))

    expect(
      await screen.findByRole('toolbar', { name: /archivos seleccionados/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('2 seleccionados')).toBeInTheDocument()

    // Toggle de vuelta: el primero deja de estar marcado.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Foto uno.png' }))
    expect(screen.getByText('1 seleccionado')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Deseleccionar todo/i }))
    await waitFor(() => {
      expect(
        screen.queryByRole('toolbar', { name: /archivos seleccionados/i }),
      ).toBeNull()
    })
  })

  it('cambiar de pestaña limpia la selección', async () => {
    stubFetch([row({ item_id: 'a', title: 'Foto.png', file_type: 'image' })])
    renderWithProviders(<BibliotecaView />)

    await screen.findByText('Foto.png')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Foto.png' }))
    expect(
      await screen.findByRole('toolbar', { name: /archivos seleccionados/i }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Imágenes' }))
    await waitFor(() => {
      expect(
        screen.queryByRole('toolbar', { name: /archivos seleccionados/i }),
      ).toBeNull()
    })
  })

  // ---- Filtro por etiqueta (PR-C) ----

  it('clickear una etiqueta setea ?etiqueta=, muestra el indicador y refetchea', async () => {
    stubFetch([
      row({ item_id: 'a', title: 'Contrato.pdf', file_type: 'pdf', tags: ['lectura'] }),
    ])
    renderWithProviders(<BibliotecaView />)

    await screen.findByText('Contrato.pdf')
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar por etiqueta lectura' }))

    await waitFor(() => {
      expect(window.location.search).toContain('etiqueta=lectura')
    })
    // Indicador removible junto a la barra de controles.
    expect(screen.getByText('Etiqueta:')).toBeInTheDocument()
    // La query refetcheó con la etiqueta.
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('tag=lectura'))).toBe(true)
    })
  })

  it('el indicador de etiqueta se puede quitar (limpia el param)', async () => {
    stubFetch([
      row({ item_id: 'a', title: 'Contrato.pdf', file_type: 'pdf', tags: ['lectura'] }),
    ])
    renderWithProviders(<BibliotecaView />)

    await screen.findByText('Contrato.pdf')
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar por etiqueta lectura' }))
    await waitFor(() => {
      expect(window.location.search).toContain('etiqueta=lectura')
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Quitar filtro de etiqueta lectura' }),
    )
    await waitFor(() => {
      expect(window.location.search).not.toContain('etiqueta=lectura')
    })
    expect(screen.queryByText('Etiqueta:')).toBeNull()
  })

  // ---- Guarda de tamaño en la subida ----

  /** File con un `size` falso (sin allocar megabytes reales) para la guarda. */
  function fakeFile(name: string, type: string, size: number): File {
    const file = new File(['x'], name, { type })
    Object.defineProperty(file, 'size', { value: size })
    return file
  }

  /** Setea archivos en el input oculto y dispara el change handler. */
  function selectFiles(files: File[]) {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('no se encontró el input file')
    Object.defineProperty(input, 'files', { value: files, configurable: true })
    fireEvent.change(input)
  }

  it('archivo demasiado grande: avisa y NO llama al endpoint de subida', async () => {
    stubFetch([])
    // ToastHost se monta junto a la vista para poder leer el mensaje del aviso.
    renderWithProviders(
      <>
        <BibliotecaView />
        <ToastHost />
      </>,
    )
    await screen.findByRole('button', { name: 'Nuevo' })

    // Un video de ~5 MB supera el tope (~4.5 MB) y no se puede comprimir.
    selectFiles([fakeFile('clip.mp4', 'video/mp4', 5 * 1024 * 1024)])

    // Mensaje claro de "demasiado grande" (caso singular, con el nombre).
    expect(
      await screen.findByText(/«clip\.mp4» es demasiado grande para subir/i),
    ).toBeInTheDocument()
    // La mutación no debe dispararse: nunca se pega a /api/library-uploads.
    expect(requestedUrls.some((u) => u.includes('/api/library-uploads'))).toBe(false)
  })

  it('varios archivos grandes: usa el mensaje plural', async () => {
    stubFetch([])
    renderWithProviders(
      <>
        <BibliotecaView />
        <ToastHost />
      </>,
    )
    await screen.findByRole('button', { name: 'Nuevo' })

    selectFiles([
      fakeFile('a.mp4', 'video/mp4', 5 * 1024 * 1024),
      fakeFile('b.mov', 'video/quicktime', 6 * 1024 * 1024),
    ])

    expect(
      await screen.findByText(/2 archivos superan el límite de subida/i),
    ).toBeInTheDocument()
    expect(requestedUrls.some((u) => u.includes('/api/library-uploads'))).toBe(false)
  })
})
