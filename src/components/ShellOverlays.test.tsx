import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShellOverlays } from './ShellOverlays'

vi.mock('./Settings', () => ({
  Settings: ({
    initialSection,
    oauthReturn,
  }: {
    initialSection?: string
    oauthReturn?: { provider: string } | null
  }) => (
    <section aria-label="settings mock">
      settings {initialSection ?? 'none'} {oauthReturn?.provider ?? 'none'}
    </section>
  ),
}))

const defaultProps = {
  settingsOpen: false,
  onCloseSettings: vi.fn(),
  theme: 'paper' as const,
  onSetTheme: vi.fn(),
  oauthReturn: null,
  paletteOpen: false,
  onClosePalette: vi.fn(),
  onNavigate: vi.fn(),
  onSelectEntity: vi.fn(),
  onOpenThread: vi.fn(),
  onRevealNotasModule: vi.fn(),
  onPaletteAction: vi.fn(),
  shortcutsOpen: false,
  onCloseShortcuts: vi.fn(),
  sortesOpen: false,
  onCloseSortes: vi.fn(),
  espejoOpen: false,
  onCloseEspejo: vi.fn(),
  careoOpen: false,
  onCloseCareo: vi.fn(),
}

describe('<ShellOverlays />', () => {
  it('deriva la sección inicial de Settings desde el retorno OAuth activo', async () => {
    const { rerender } = render(
      <ShellOverlays
        {...defaultProps}
        settingsOpen
        oauthReturn={{ provider: 'spotify', ok: false, code: 'access_denied' }}
      />,
    )

    expect(await screen.findByText('settings spotify spotify')).toBeInTheDocument()

    rerender(
      <ShellOverlays
        {...defaultProps}
        settingsOpen
        oauthReturn={{ provider: 'x', ok: true, code: null }}
      />,
    )

    expect(await screen.findByText('settings x x')).toBeInTheDocument()
  })
})
