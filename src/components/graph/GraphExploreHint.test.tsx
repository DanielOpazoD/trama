import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GraphExploreHint } from './GraphExploreHint'

describe('<GraphExploreHint />', () => {
  it('muestra el conteo (con o sin separador de miles según el ICU del entorno) y el copy', () => {
    render(
      <GraphExploreHint entityCount={2347} onSwitch={() => {}} onDismiss={() => {}} />,
    )
    // Node con ICU completo formatea "2.347" en es; happy-dom/Node con
    // ICU mínimo cae a "2347". Aceptamos ambos.
    expect(screen.getByRole('status').textContent).toMatch(/2[.,\s]?347/)
    expect(screen.getByRole('button', { name: /cambiar/i })).toBeInTheDocument()
  })

  it('dispara onSwitch al click en "cambiar"', async () => {
    const onSwitch = vi.fn()
    const onDismiss = vi.fn()
    render(
      <GraphExploreHint entityCount={2500} onSwitch={onSwitch} onDismiss={onDismiss} />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /cambiar/i }))
    expect(onSwitch).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('dispara onDismiss al click en "No recordar"', async () => {
    const onSwitch = vi.fn()
    const onDismiss = vi.fn()
    render(
      <GraphExploreHint entityCount={2500} onSwitch={onSwitch} onDismiss={onDismiss} />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /no recordar/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onSwitch).not.toHaveBeenCalled()
  })
})
