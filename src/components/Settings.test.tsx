import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Settings } from './Settings'

vi.mock('./settings/HealthPanel', () => ({
  HealthPanel: () => <section>panel estado</section>,
}))
vi.mock('./settings/LogsPanel', () => ({
  LogsPanel: () => <section>panel logs</section>,
}))
vi.mock('./settings/AppearancePanel', () => ({
  AppearancePanel: ({
    theme,
    onSetTheme,
  }: {
    theme: 'paper' | 'night' | 'vela'
    onSetTheme: (theme: 'paper' | 'night' | 'vela') => void
  }) => (
    <section>
      panel apariencia {theme}
      <button onClick={() => onSetTheme('night')}>tema noche</button>
    </section>
  ),
}))
vi.mock('./settings/PrivacyPanel', () => ({
  PrivacyPanel: () => <section>panel privacidad</section>,
}))
vi.mock('./settings/SpotifyPanel', () => ({
  SpotifyPanel: ({ oauthReturn }: { oauthReturn: unknown }) => (
    <section>panel spotify {oauthReturn ? 'oauth' : 'sin oauth'}</section>
  ),
}))
vi.mock('./settings/XPanel', () => ({
  XPanel: ({ oauthReturn }: { oauthReturn: unknown }) => (
    <section>panel x {oauthReturn ? 'oauth' : 'sin oauth'}</section>
  ),
}))
vi.mock('./settings/AIPanel', () => ({
  AIPanel: () => <section>panel ia</section>,
}))
vi.mock('./settings/SearchPanel', () => ({
  SearchPanel: () => <section>panel búsqueda</section>,
}))
vi.mock('./settings/DataPanel', () => ({
  DataPanel: () => <section>panel datos</section>,
}))

describe('<Settings />', () => {
  it('no renderiza cuando está cerrado', () => {
    render(
      <Settings open={false} onClose={() => {}} theme="paper" onSetTheme={() => {}} />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('es un diálogo modal accesible (role=dialog + aria-modal)', () => {
    render(<Settings open onClose={() => {}} theme="paper" onSetTheme={() => {}} />)

    const dialog = screen.getByRole('dialog', { name: 'Configuración' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('navega entre secciones, pasa tema y cierra por Escape/backdrop', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onSetTheme = vi.fn()

    render(<Settings open onClose={onClose} theme="paper" onSetTheme={onSetTheme} />)

    expect(screen.getByRole('dialog', { name: 'Configuración' })).toBeInTheDocument()
    expect(screen.getByText('panel estado')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Apariencia/i }))
    expect(screen.getByText(/panel apariencia paper/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'tema noche' }))
    expect(onSetTheme).toHaveBeenCalledWith('night')

    await user.click(screen.getByRole('button', { name: 'Cerrar configuración' }))
    // Escape lo intercepta useModalOverlay con un listener en `document`
    // (fase de captura), por eso lo disparamos sobre `document`.
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('abre la sección inicial y entrega solo el oauth del provider correspondiente', async () => {
    const user = userEvent.setup()

    render(
      <Settings
        open
        onClose={() => {}}
        theme="night"
        onSetTheme={() => {}}
        initialSection="spotify"
        oauthReturn={{ provider: 'spotify', ok: false, code: 'access_denied' }}
      />,
    )

    expect(screen.getByText('panel spotify oauth')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /X \(Twitter\)/i }))
    expect(screen.getByText('panel x sin oauth')).toBeInTheDocument()
  })

  it('sincroniza la sección cuando cambia initialSection', () => {
    const { rerender } = render(
      <Settings
        open
        onClose={() => {}}
        theme="night"
        onSetTheme={() => {}}
        initialSection="spotify"
      />,
    )

    expect(screen.getByText('panel spotify sin oauth')).toBeInTheDocument()

    rerender(
      <Settings
        open
        onClose={() => {}}
        theme="night"
        onSetTheme={() => {}}
        initialSection="x"
      />,
    )

    expect(screen.getByText('panel x sin oauth')).toBeInTheDocument()
  })
})
