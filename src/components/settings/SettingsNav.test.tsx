import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SettingsNav } from './SettingsNav'

const preloadSettingsPanelMock = vi.hoisted(() => vi.fn())

vi.mock('./SettingsLazyPanelHost', () => ({
  preloadSettingsPanel: preloadSettingsPanelMock,
}))

describe('<SettingsNav />', () => {
  it('precarga paneles lazy al mostrar intención, pero no paneles eager', async () => {
    const user = userEvent.setup()
    const onSectionChange = vi.fn()
    render(<SettingsNav section="health" onSectionChange={onSectionChange} />)

    fireEvent.pointerEnter(screen.getByRole('button', { name: /Logs/i }))
    expect(preloadSettingsPanelMock).toHaveBeenCalledWith('logs')

    await user.tab()
    expect(screen.getByRole('button', { name: /Estado/i })).toHaveFocus()
    expect(preloadSettingsPanelMock).not.toHaveBeenCalledWith('health')

    await user.tab()
    expect(screen.getByRole('button', { name: /Logs/i })).toHaveFocus()
    expect(preloadSettingsPanelMock).toHaveBeenCalledTimes(2)
    expect(preloadSettingsPanelMock).toHaveBeenLastCalledWith('logs')

    await user.click(screen.getByRole('button', { name: /Logs/i }))
    expect(onSectionChange).toHaveBeenCalledWith('logs')
  })
})
