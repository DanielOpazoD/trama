import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { ClavesView } from './ClavesView'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('<ClavesView />', () => {
  it('bloquea automáticamente el vault después de inactividad', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    renderWithProviders(<ClavesView autoLockMs={10} />)

    fireEvent.change(screen.getByPlaceholderText('Clave de acceso'), {
      target: { value: 'password-seguro' },
    })
    fireEvent.change(screen.getByPlaceholderText('Confirmar clave'), {
      target: { value: 'password-seguro' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'crear vault' }))

    await screen.findByRole('button', { name: 'bloquear vault' })
    await waitFor(
      () => {
        expect(screen.getByPlaceholderText('Clave de acceso')).toBeInTheDocument()
      },
      { timeout: 100 },
    )
  })

  it('limpia el portapapeles después de copiar una clave si no cambió el contenido', async () => {
    let storedSecret = ''
    const writes: string[] = []
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(async (value: string) => {
          writes.push(value)
        }),
        readText: vi.fn(async () => writes[writes.length - 1] ?? ''),
      },
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/secrets') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        storedSecret = body.secret
        return new Response(
          JSON.stringify({
            id: 's1',
            label: body.label,
            kind: body.kind,
            service: body.service,
            username: body.username,
            notes: body.notes,
            favorite: false,
            critical: false,
            expires_at: null,
            last_rotated_at: null,
            copied_at: null,
            created_at: '2026-06-01T00:00:00.000Z',
            updated_at: '2026-06-01T00:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.endsWith('/api/secrets/s1/reveal')) {
        return new Response(JSON.stringify({ secret: storedSecret }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.endsWith('/api/secrets/s1/copied')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify(
          storedSecret
            ? [
                {
                  id: 's1',
                  label: 'OpenAI',
                  kind: 'api_key',
                  service: null,
                  username: null,
                  notes: null,
                  favorite: false,
                  critical: false,
                  expires_at: null,
                  last_rotated_at: null,
                  copied_at: null,
                  created_at: '2026-06-01T00:00:00.000Z',
                  updated_at: '2026-06-01T00:00:00.000Z',
                },
              ]
            : [],
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithProviders(<ClavesView clipboardClearMs={10} />)

    fireEvent.change(screen.getByPlaceholderText('Clave de acceso'), {
      target: { value: 'password-seguro' },
    })
    fireEvent.change(screen.getByPlaceholderText('Confirmar clave'), {
      target: { value: 'password-seguro' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'crear vault' }))

    // El alta vive detrás de «Añadir», como en las demás vistas.
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir' }))
    await screen.findByPlaceholderText('Nombre de la clave')
    fireEvent.change(screen.getByPlaceholderText('Nombre de la clave'), {
      target: { value: 'OpenAI' },
    })
    fireEvent.change(screen.getByPlaceholderText('Valor secreto'), {
      target: { value: 'sk-test' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'guardar clave' }))

    await screen.findByRole('button', { name: 'Copiar clave' })
    fireEvent.click(screen.getByRole('button', { name: 'Copiar clave' }))

    await waitFor(() => expect(writes).toContain('sk-test'))
    await waitFor(() => expect(writes[writes.length - 1]).toBe(''), { timeout: 100 })
  })

  it('guarda usuario y notas como metadata cifrada del vault', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/secrets') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        expect(body.username).toEqual(expect.stringContaining('"alg":"AES-GCM"'))
        expect(body.notes).toEqual(expect.stringContaining('"alg":"AES-GCM"'))
        expect(body.username).not.toContain('daniel@example.com')
        expect(body.notes).not.toContain('rotar cada mes')
        return new Response(
          JSON.stringify({
            id: 's1',
            label: body.label,
            kind: body.kind,
            service: body.service,
            username: body.username,
            notes: body.notes,
            favorite: false,
            critical: false,
            expires_at: null,
            last_rotated_at: null,
            copied_at: null,
            created_at: '2026-06-01T00:00:00.000Z',
            updated_at: '2026-06-01T00:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithProviders(<ClavesView />)

    fireEvent.change(screen.getByPlaceholderText('Clave de acceso'), {
      target: { value: 'password-seguro' },
    })
    fireEvent.change(screen.getByPlaceholderText('Confirmar clave'), {
      target: { value: 'password-seguro' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'crear vault' }))

    // El alta vive detrás de «Añadir», como en las demás vistas.
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir' }))
    await screen.findByPlaceholderText('Nombre de la clave')
    fireEvent.change(screen.getByPlaceholderText('Nombre de la clave'), {
      target: { value: 'OpenAI' },
    })
    fireEvent.change(screen.getByPlaceholderText('Valor secreto'), {
      target: { value: 'sk-test' },
    })
    fireEvent.change(screen.getByPlaceholderText('Usuario o identificador'), {
      target: { value: 'daniel@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Notas privadas'), {
      target: { value: 'rotar cada mes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'guardar clave' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/secrets',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('edita metadata sensible reenviándola cifrada', async () => {
    let storedSecret = ''
    let storedUsername = ''
    let storedNotes = ''
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/secrets') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        storedSecret = body.secret
        storedUsername = body.username
        storedNotes = body.notes
        return new Response(
          JSON.stringify({
            id: 's1',
            label: body.label,
            kind: body.kind,
            service: body.service,
            username: body.username,
            notes: body.notes,
            favorite: false,
            critical: false,
            expires_at: null,
            last_rotated_at: null,
            copied_at: null,
            created_at: '2026-06-01T00:00:00.000Z',
            updated_at: '2026-06-01T00:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.endsWith('/api/secrets/s1') && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body))
        expect(body.username).toEqual(expect.stringContaining('"alg":"AES-GCM"'))
        expect(body.notes).toEqual(expect.stringContaining('"alg":"AES-GCM"'))
        expect(body.username).not.toContain('nuevo@example.com')
        expect(body.notes).not.toContain('nota editada')
        return new Response(
          JSON.stringify({
            id: 's1',
            label: body.label,
            kind: body.kind,
            service: body.service,
            username: body.username,
            notes: body.notes,
            favorite: false,
            critical: false,
            expires_at: null,
            last_rotated_at: null,
            copied_at: null,
            created_at: '2026-06-01T00:00:00.000Z',
            updated_at: '2026-06-01T00:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(
        JSON.stringify(
          storedSecret
            ? [
                {
                  id: 's1',
                  label: 'OpenAI',
                  kind: 'api_key',
                  service: null,
                  username: storedUsername,
                  notes: storedNotes,
                  favorite: false,
                  critical: false,
                  expires_at: null,
                  last_rotated_at: null,
                  copied_at: null,
                  created_at: '2026-06-01T00:00:00.000Z',
                  updated_at: '2026-06-01T00:00:00.000Z',
                },
              ]
            : [],
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithProviders(<ClavesView />)

    fireEvent.change(screen.getByPlaceholderText('Clave de acceso'), {
      target: { value: 'password-seguro' },
    })
    fireEvent.change(screen.getByPlaceholderText('Confirmar clave'), {
      target: { value: 'password-seguro' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'crear vault' }))

    // El alta vive detrás de «Añadir», como en las demás vistas.
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir' }))
    await screen.findByPlaceholderText('Nombre de la clave')
    fireEvent.change(screen.getByPlaceholderText('Nombre de la clave'), {
      target: { value: 'OpenAI' },
    })
    fireEvent.change(screen.getByPlaceholderText('Valor secreto'), {
      target: { value: 'sk-test' },
    })
    fireEvent.change(screen.getByPlaceholderText('Usuario o identificador'), {
      target: { value: 'daniel@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Notas privadas'), {
      target: { value: 'rotar cada mes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'guardar clave' }))

    await screen.findByText('daniel@example.com')
    await screen.findByRole('button', { name: 'Editar clave' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar clave' }))
    fireEvent.change(screen.getByDisplayValue('daniel@example.com'), {
      target: { value: 'nuevo@example.com' },
    })
    fireEvent.change(screen.getByDisplayValue('rotar cada mes'), {
      target: { value: 'nota editada' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'guardar cambios' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/secrets/s1',
        expect.objectContaining({ method: 'PATCH' }),
      )
    })
  })
})
