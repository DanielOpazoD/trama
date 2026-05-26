import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from './ErrorBoundary'

// Componente de prueba que lanza un error en render cuando se le pide.
function Bomb({ trigger }: { trigger: boolean }) {
  if (trigger) {
    throw new Error('algo explotó en el render')
  }
  return <p>todo bien</p>
}

describe('<ErrorBoundary />', () => {
  // Las pruebas que provocan errores en render llenan stderr con el
  // mensaje. Lo silenciamos para no contaminar el output de los tests.
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('renderiza los children normalmente cuando no hay error', () => {
    render(
      <ErrorBoundary>
        <Bomb trigger={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('todo bien')).toBeInTheDocument()
  })

  it('muestra el fallback cuando un child throw en render', () => {
    render(
      <ErrorBoundary>
        <Bomb trigger={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/La trama se rompió/i)).toBeInTheDocument()
  })

  it('el fallback expone el mensaje del error en los detalles', () => {
    render(
      <ErrorBoundary>
        <Bomb trigger={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/algo explotó en el render/)).toBeInTheDocument()
  })

  it('reporta el error a /api/error-log via POST', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchSpy)

    render(
      <ErrorBoundary>
        <Bomb trigger={true} />
      </ErrorBoundary>,
    )

    // El reporte se dispara async desde componentDidCatch. Esperamos un
    // tick para que se ejecute.
    await new Promise((r) => setTimeout(r, 0))

    expect(fetchSpy).toHaveBeenCalled()
    const call = fetchSpy.mock.calls[0]!
    expect(call[0]).toBe('/api/error-log')
    expect(call[1]?.method).toBe('POST')
    const body = JSON.parse(call[1]!.body as string)
    expect(body.message).toBe('algo explotó en el render')
    expect(typeof body.stack).toBe('string')
  })

  it('"Intentar de nuevo" resetea el state — si el child ya no throws, vuelve', async () => {
    function Toggleable() {
      // Usa un state externo para que el reset funcione: nosotros
      // controlamos la condición desde fuera.
      return <p>vivo de nuevo</p>
    }

    // Renderizamos con un child que throws, luego cambiamos las props
    // antes de presionar reset.
    const { rerender } = render(
      <ErrorBoundary>
        <Bomb trigger={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/La trama se rompió/i)).toBeInTheDocument()

    // Reemplazamos el child para que ya no throws.
    rerender(
      <ErrorBoundary>
        <Toggleable />
      </ErrorBoundary>,
    )

    // Click en "Intentar de nuevo"
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Intentar de nuevo/i }))

    expect(screen.queryByText(/La trama se rompió/i)).toBeNull()
    expect(screen.getByText('vivo de nuevo')).toBeInTheDocument()
  })

  it('"Copiar detalles" intenta usar el clipboard', async () => {
    // happy-dom provee navigator.clipboard como un objeto Clipboard real,
    // pero podemos spyear directamente su método writeText. No hace falta
    // reemplazar todo el clipboard.
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)

    render(
      <ErrorBoundary>
        <Bomb trigger={true} />
      </ErrorBoundary>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Copiar detalles/i }))
    // El handler es async; esperamos un tick para que termine.
    await new Promise((r) => setTimeout(r, 0))

    expect(writeText).toHaveBeenCalled()
    const text = writeText.mock.calls[0]![0]
    expect(text).toMatch(/algo explotó en el render/)

    writeText.mockRestore()
  })

  it('si el fetch del reporte falla, el componente sigue mostrando el fallback', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('backend caído'))
    vi.stubGlobal('fetch', fetchSpy)

    render(
      <ErrorBoundary>
        <Bomb trigger={true} />
      </ErrorBoundary>,
    )
    await new Promise((r) => setTimeout(r, 0))

    // El fallback sigue ahí — el fail del reporte no rompe nada.
    expect(screen.getByText(/La trama se rompió/i)).toBeInTheDocument()
  })
})
