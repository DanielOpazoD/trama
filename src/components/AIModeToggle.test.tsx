import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { AIModeToggle } from './AIModeToggle'
import { AI_MODE_STORAGE_KEY, AI_MODEL_STORAGE_KEY } from '../hooks/useAIMode'

describe('<AIModeToggle />', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('abre el menú, cambia a off y persiste el modo', async () => {
    const user = userEvent.setup()

    render(<AIModeToggle />)

    await user.click(screen.getByRole('button', { name: 'IA Auto' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Off' }))

    expect(window.localStorage.getItem(AI_MODE_STORAGE_KEY)).toBe('off')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'IA Off' })).toBeInTheDocument()
  })

  it('mantiene abierto el menú para elegir modelo cuando se fuerza provider', async () => {
    const user = userEvent.setup()

    render(<AIModeToggle />)

    await user.click(screen.getByRole('button', { name: 'IA Auto' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Forzar OpenAI' }))

    expect(window.localStorage.getItem(AI_MODE_STORAGE_KEY)).toBe('forced-openai')
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByRole('menuitemradio', { name: 'gpt-4o' }))

    expect(window.localStorage.getItem(AI_MODEL_STORAGE_KEY)).toBe('gpt-4o')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'IA Forzar OpenAI' })).toBeInTheDocument()
  })

  it('se cierra con Escape y soporta el modo colapsado', async () => {
    const user = userEvent.setup()

    render(<AIModeToggle collapsed />)

    await user.click(screen.getByRole('button', { name: 'IA Auto' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
