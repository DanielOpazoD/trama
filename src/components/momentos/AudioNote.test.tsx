import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AudioNote } from './AudioNote'

/**
 * AudioNote — reproductor de nota de voz. happy-dom no implementa la
 * reproducción real de HTMLMediaElement, así que mockeamos play/pause y
 * verificamos el wiring: que exista el botón, el <audio> con su src, y que
 * el click dispare play() + alterne el estado (label/aria-pressed).
 */

beforeEach(() => {
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(
      async () => new Response(new Blob(['audio'], { type: 'audio/mpeg' })),
    ),
  )
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:audio-note'),
      revokeObjectURL: vi.fn(),
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('<AudioNote />', () => {
  it('renderiza el botón play y el <audio> con el src autenticado', async () => {
    const { container } = render(<AudioNote src="/api/momentos-file/u%2Fa.mp3" />)
    expect(
      screen.getByRole('button', { name: /reproducir nota de voz/i }),
    ).toBeInTheDocument()
    const audio = container.querySelector('audio')
    expect(audio).not.toBeNull()
    await waitFor(() => expect(audio).toHaveAttribute('src', 'blob:audio-note'))
  })

  it('al hacer click reproduce y alterna a pausar', () => {
    render(<AudioNote src="/api/momentos-file/u%2Fa.mp3" />)
    const btn = screen.getByRole('button', { name: /reproducir nota de voz/i })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(btn)
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
    // El estado optimista cambia el label a "Pausar".
    const pauseBtn = screen.getByRole('button', { name: /pausar nota de voz/i })
    expect(pauseBtn).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(pauseBtn)
    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
  })
})
