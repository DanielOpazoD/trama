import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { ToastProvider, useToast, type Toast } from '../state/toast'
import { ToastHost } from './ToastHost'

/**
 * Helper que captura el método show() del context vía un callback fired
 * on mount. La ref que devuelve está garantizada estable y se llena
 * antes de cualquier interacción del test.
 */
function Harness({
  captureShow,
}: {
  captureShow: (show: (toast: Omit<Toast, 'id'>) => void) => void
}) {
  const { show } = useToast()
  useEffect(() => {
    captureShow(show)
  }, [show, captureShow])
  return <ToastHost />
}

function setup() {
  let showRef: ((toast: Omit<Toast, 'id'>) => void) | null = null
  render(
    <ToastProvider>
      <Harness
        captureShow={(s) => {
          showRef = s
        }}
      />
    </ToastProvider>,
  )
  if (!showRef) throw new Error('show() not captured')
  return {
    show(toast: Omit<Toast, 'id'>) {
      act(() => {
        showRef!(toast)
      })
    },
  }
}

describe('<ToastHost />', () => {
  it('no renderiza nada cuando no hay toast activo', () => {
    render(
      <ToastProvider>
        <ToastHost />
      </ToastProvider>,
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('renderiza el mensaje cuando se dispara show()', () => {
    const { show } = setup()
    show({ message: 'Cambios guardados' })
    expect(screen.getByText('Cambios guardados')).toBeInTheDocument()
  })

  it('renderiza el botón de acción y lo gatilla', async () => {
    const onAction = vi.fn()
    const { show } = setup()
    show({
      message: 'Cita eliminada',
      action: { label: 'Deshacer', onAction },
    })

    const undoBtn = screen.getByRole('button', { name: 'Deshacer' })
    const user = userEvent.setup()
    await user.click(undoBtn)

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1))
  })

  it('cierra al click en el botón ✕', async () => {
    const { show } = setup()
    show({ message: 'Algo' })
    expect(screen.getByText('Algo')).toBeInTheDocument()

    const closeBtn = screen.getByLabelText('Cerrar aviso')
    const user = userEvent.setup()
    await user.click(closeBtn)

    await waitFor(() => expect(screen.queryByText('Algo')).toBeNull())
  })

  it('aplica el estilo "error" cuando tone === "error"', () => {
    const { show } = setup()
    show({ message: 'Algo falló', tone: 'error' })
    const status = screen.getByRole('status')
    expect(status.querySelector('.toast-error')).not.toBeNull()
  })
})
