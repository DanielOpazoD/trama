import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OverflowMenu, OverflowMenuItem } from './OverflowMenu'

describe('OverflowMenu', () => {
  it('keeps the menu open through reflows and closes on outside click', () => {
    render(
      <OverflowMenu label="Más acciones">
        {() => <OverflowMenuItem onClick={() => {}}>→ momento</OverflowMenuItem>}
      </OverflowMenu>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Más acciones' }))
    fireEvent.scroll(window)

    expect(screen.getByRole('menuitem', { name: /→ momento/ })).toBeInTheDocument()

    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('menuitem', { name: /→ momento/ })).not.toBeInTheDocument()
  })
})
