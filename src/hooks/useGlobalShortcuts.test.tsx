import { fireEvent, render } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { useGlobalShortcuts } from './useGlobalShortcuts'

function Harness({
  onTogglePalette = () => {},
  onOpenPalette = () => {},
  onToggleShortcuts = () => {},
  onToggleFocusMode = () => {},
}: {
  onTogglePalette?: () => void
  onOpenPalette?: () => void
  onToggleShortcuts?: () => void
  onToggleFocusMode?: () => void
}) {
  useGlobalShortcuts({
    onTogglePalette,
    onOpenPalette,
    onToggleShortcuts,
    onToggleFocusMode,
  })
  return <input aria-label="campo" />
}

describe('useGlobalShortcuts', () => {
  test('Cmd/Ctrl+K alterna el command palette', () => {
    const onTogglePalette = vi.fn()
    render(<Harness onTogglePalette={onTogglePalette} />)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))

    expect(onTogglePalette).toHaveBeenCalledTimes(2)
  })

  test('abre palette, shortcuts y focus mode con teclas sin modifier fuera de campos', () => {
    const onOpenPalette = vi.fn()
    const onToggleShortcuts = vi.fn()
    const onToggleFocusMode = vi.fn()
    render(
      <Harness
        onOpenPalette={onOpenPalette}
        onToggleShortcuts={onToggleShortcuts}
        onToggleFocusMode={onToggleFocusMode}
      />,
    )

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\' }))

    expect(onOpenPalette).toHaveBeenCalledOnce()
    expect(onToggleShortcuts).toHaveBeenCalledOnce()
    expect(onToggleFocusMode).toHaveBeenCalledOnce()
  })

  test('ignora shortcuts sin modifier cuando el foco está en un campo editable', () => {
    const onOpenPalette = vi.fn()
    const onToggleShortcuts = vi.fn()
    const onToggleFocusMode = vi.fn()
    const { getByLabelText } = render(
      <Harness
        onOpenPalette={onOpenPalette}
        onToggleShortcuts={onToggleShortcuts}
        onToggleFocusMode={onToggleFocusMode}
      />,
    )

    const input = getByLabelText('campo')
    input.focus()
    fireEvent.keyDown(input, { key: '/' })
    fireEvent.keyDown(input, { key: '?' })
    fireEvent.keyDown(input, { key: '\\' })

    expect(onOpenPalette).not.toHaveBeenCalled()
    expect(onToggleShortcuts).not.toHaveBeenCalled()
    expect(onToggleFocusMode).not.toHaveBeenCalled()
  })
})
