/**
 * Tests del DataPanel — flujo de import con preview aditivo.
 *
 * Foco:
 *  - Al seleccionar archivo NO se importa inmediatamente — aparece el
 *    preview con los counts y un botón "Agregar X nuevas".
 *  - El preview separa correctamente nuevas vs duplicadas comparando
 *    contra los IDs cacheados por TanStack Query.
 *  - Click en "Cancelar" descarta sin llamar doImport.
 *  - Click en "Agregar" llama doImport con el payload completo.
 *  - El backend sigue siendo aditivo — el mensaje lo reitera.
 *  - Helper `buildPreview` cubierto como pure function.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineContext } from '../../state/offline'
import { ToastProvider } from '../../state/toast'
import { queryKeys } from '../../state/queryClient'
import { DataPanel, buildPreview } from './DataPanel'
import * as apiModule from '../../api'
import type { Entity, ExportPayload, Quote, Relationship } from '../../types'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
}

function wrap(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <OfflineContext.Provider value={{ offline: false, setOffline: () => {} }}>
          <ToastProvider>{children}</ToastProvider>
        </OfflineContext.Provider>
      </QueryClientProvider>
    )
  }
}

/**
 * Construye un File desde un payload de import. Vitest+happy-dom
 * soportan File con .text() async, así que el handler del input
 * funciona idéntico al browser real.
 */
function makeFile(payload: ExportPayload, name = 'trama.json'): File {
  return new File([JSON.stringify(payload)], name, { type: 'application/json' })
}

const EMPTY_PAYLOAD: ExportPayload = {
  version: 1,
  exportedAt: '2026-05-28T10:00:00Z',
  entities: [],
  relationships: [],
  quotes: [],
}

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.restoreAllMocks())

describe('buildPreview (pure)', () => {
  it('cuenta cada bucket separando nuevas vs duplicadas', () => {
    const payload: ExportPayload = {
      version: 1,
      exportedAt: '2026-05-28T10:00:00Z',
      entities: [
        { id: 'e-1' },
        { id: 'e-2' },
        { id: 'e-3' },
      ] as ExportPayload['entities'],
      relationships: [{ id: 'r-1' }] as ExportPayload['relationships'],
      quotes: [{ id: 'q-1' }, { id: 'q-2' }] as ExportPayload['quotes'],
    }
    const result = buildPreview(
      payload,
      new Set(['e-2']), // 1 entity ya existe
      new Set(), // ningún relationship existente
      new Set(['q-1', 'q-2']), // las 2 quotes ya existen
    )
    expect(result.entities).toEqual({ incoming: 3, news: 2, duplicates: 1 })
    expect(result.relationships).toEqual({ incoming: 1, news: 1, duplicates: 0 })
    expect(result.quotes).toEqual({ incoming: 2, news: 0, duplicates: 2 })
    expect(result.totalIncoming).toBe(6)
    expect(result.totalNew).toBe(3)
    expect(result.totalDuplicates).toBe(3)
  })

  it('filas sin id se cuentan como duplicadas (defensivo)', () => {
    const payload = {
      version: 1,
      exportedAt: '',
      entities: [{ id: 'e-1' }, {}],
      relationships: [],
      quotes: [],
    } as unknown as ExportPayload
    const result = buildPreview(payload, new Set(), new Set(), new Set())
    // La entity sin id va a "duplicates" — no se puede importar igual.
    expect(result.entities).toEqual({ incoming: 2, news: 1, duplicates: 1 })
  })

  it('listas faltantes se tratan como vacías', () => {
    // Forzamos un payload incompleto — defensivo en caso de archivos
    // truncados o de versiones futuras con campos opcionales.
    const payload = {
      version: 1,
      exportedAt: '',
    } as unknown as ExportPayload
    const result = buildPreview(payload, new Set(), new Set(), new Set())
    expect(result.totalIncoming).toBe(0)
    expect(result.totalNew).toBe(0)
  })
})

describe('<DataPanel /> — flujo de import con preview', () => {
  it('al subir archivo no llama al backend inmediato; aparece el preview', async () => {
    const importSpy = vi.spyOn(apiModule.api, 'importAll')
    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [])
    qc.setQueryData<Quote[]>(queryKeys.quotes, [])
    qc.setQueryData<Relationship[]>(queryKeys.relationships, [])

    render(<DataPanel />, { wrapper: wrap(qc) })

    const payload: ExportPayload = {
      ...EMPTY_PAYLOAD,
      entities: [
        { id: 'e-new-1', type: 'persona', name: 'Borges' },
      ] as ExportPayload['entities'],
    }

    const file = makeFile(payload)
    const inputEl = document.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(inputEl, file)

    // Preview aparece y dice "1 nueva". El backend NO se llamó todavía.
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /vista previa/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /agregar 1 nuevas?/i })).toBeInTheDocument()
    expect(importSpy).not.toHaveBeenCalled()
  })

  it('separa correctamente nuevas vs duplicadas usando el cache de TanStack', async () => {
    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [{ id: 'e-1' }] as Entity[])
    qc.setQueryData<Quote[]>(queryKeys.quotes, [])
    qc.setQueryData<Relationship[]>(queryKeys.relationships, [])

    render(<DataPanel />, { wrapper: wrap(qc) })

    // 2 entidades: una ya existe (e-1), otra no (e-2).
    const payload: ExportPayload = {
      ...EMPTY_PAYLOAD,
      entities: [
        { id: 'e-1', type: 'persona', name: 'old' },
        { id: 'e-2', type: 'persona', name: 'new' },
      ] as ExportPayload['entities'],
    }
    const file = makeFile(payload)
    const inputEl = document.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(inputEl, file)

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /vista previa/i })).toBeInTheDocument()
    })
    // Botón refleja "1 nueva" porque la otra es duplicada.
    expect(screen.getByRole('button', { name: /agregar 1 nuevas?/i })).toBeInTheDocument()
  })

  it('"Cancelar" descarta el preview sin llamar al backend', async () => {
    const importSpy = vi.spyOn(apiModule.api, 'importAll')
    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [])
    qc.setQueryData<Quote[]>(queryKeys.quotes, [])
    qc.setQueryData<Relationship[]>(queryKeys.relationships, [])

    render(<DataPanel />, { wrapper: wrap(qc) })

    const payload: ExportPayload = {
      ...EMPTY_PAYLOAD,
      entities: [{ id: 'e-1', type: 'persona', name: 'x' }] as ExportPayload['entities'],
    }
    const file = makeFile(payload)
    const inputEl = document.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(inputEl, file)

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /vista previa/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(screen.queryByRole('region', { name: /vista previa/i })).toBeNull()
    expect(importSpy).not.toHaveBeenCalled()
  })

  it('"Agregar X nuevas" llama doImport con el payload completo', async () => {
    const importSpy = vi
      .spyOn(apiModule.api, 'importAll')
      .mockResolvedValue({ imported: 1, skipped: 0, failed: [] })
    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [])
    qc.setQueryData<Quote[]>(queryKeys.quotes, [])
    qc.setQueryData<Relationship[]>(queryKeys.relationships, [])

    render(<DataPanel />, { wrapper: wrap(qc) })

    const payload: ExportPayload = {
      ...EMPTY_PAYLOAD,
      entities: [{ id: 'e-1', type: 'persona', name: 'x' }] as ExportPayload['entities'],
    }
    const file = makeFile(payload)
    const inputEl = document.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(inputEl, file)

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /agregar 1 nuevas?/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /agregar 1 nuevas?/i }))

    await waitFor(() => expect(importSpy).toHaveBeenCalledTimes(1))
    expect(importSpy).toHaveBeenCalledWith(payload)
  })

  it('si TODAS las filas son duplicadas, el botón "Agregar" queda deshabilitado', async () => {
    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [{ id: 'e-1' }] as Entity[])
    qc.setQueryData<Quote[]>(queryKeys.quotes, [])
    qc.setQueryData<Relationship[]>(queryKeys.relationships, [])

    render(<DataPanel />, { wrapper: wrap(qc) })

    const payload: ExportPayload = {
      ...EMPTY_PAYLOAD,
      entities: [
        { id: 'e-1', type: 'persona', name: 'dup' },
      ] as ExportPayload['entities'],
    }
    const file = makeFile(payload)
    const inputEl = document.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(inputEl, file)

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /vista previa/i })).toBeInTheDocument()
    })
    const addButton = screen.getByRole('button', { name: /no hay nuevas para agregar/i })
    expect(addButton).toBeDisabled()
  })

  it('muestra el mensaje "es aditiva, no reemplaza" en el preview', async () => {
    const qc = makeQueryClient()
    qc.setQueryData<Entity[]>(queryKeys.entities, [])
    qc.setQueryData<Quote[]>(queryKeys.quotes, [])
    qc.setQueryData<Relationship[]>(queryKeys.relationships, [])

    render(<DataPanel />, { wrapper: wrap(qc) })

    const payload: ExportPayload = {
      ...EMPTY_PAYLOAD,
      entities: [{ id: 'e-1', type: 'persona', name: 'x' }] as ExportPayload['entities'],
    }
    const file = makeFile(payload)
    const inputEl = document.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(inputEl, file)

    await waitFor(() => {
      // El copy aclaratorio aparece — usuario sabe que no se va a sobrescribir nada.
      expect(screen.getByText(/aditiva/i)).toBeInTheDocument()
      expect(screen.getByText(/no reemplaza/i)).toBeInTheDocument()
    })
  })
})
