import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyDoc } from '../../../../lib/pdfStudio/model/model'
import type { SavedDoc } from '../../../../lib/pdfStudio/render/persistence'
import { PdfStudioEmptyPaths } from './PdfStudioEmptyPaths'

type Props = Parameters<typeof PdfStudioEmptyPaths>[0]

function guardado(name: string, over: Partial<SavedDoc> = {}): SavedDoc {
  return { id: name, name, doc: emptyDoc(), savedAt: 0, kind: 'creation', ...over }
}

function renderPaths(props: Partial<Props> = {}) {
  const handlers = { onOpenSaved: vi.fn(), onShowSaved: vi.fn(), onGoToSection: vi.fn() }
  const view = render(
    <PdfStudioEmptyPaths mode="editor" saved={[]} {...handlers} {...props} />,
  )
  return { ...handlers, ...view }
}

describe('<PdfStudioEmptyPaths />', () => {
  it('ofrece las secciones que ya envían a Imprenta como acciones reales', () => {
    const { onGoToSection } = renderPaths()
    fireEvent.click(screen.getByRole('button', { name: 'Desde la Biblioteca' }))
    fireEvent.click(screen.getByRole('button', { name: 'Desde tus notas y capturas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear una planilla' }))
    expect(onGoToSection.mock.calls).toEqual([['biblioteca'], ['notas'], ['planillas']])
  })

  it('el camino de Momentos, que vive en el otro mundo, se nombra con su rótulo real', () => {
    renderPaths()
    expect(screen.getByText(/«Fotos a Imprenta»/)).toBeInTheDocument()
  })

  it('sin guardados no inventa un «Retomar», y en Planillas sin planillas calla', () => {
    renderPaths()
    expect(screen.queryByRole('button', { name: /Retomar/ })).not.toBeInTheDocument()
    const { container } = render(
      <PdfStudioEmptyPaths
        mode="templates"
        saved={[]}
        onOpenSaved={vi.fn()}
        onShowSaved={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('retoma el PDF guardado más reciente y abre el panel cuando hay más', () => {
    const viejo = guardado('Informe viejo', { savedAt: 1 })
    const nuevo = guardado('Informe nuevo', { savedAt: 5 })
    const planilla = guardado('Ingreso', { savedAt: 9, kind: 'template' })
    const { onOpenSaved, onShowSaved } = renderPaths({ saved: [viejo, nuevo, planilla] })

    fireEvent.click(screen.getByRole('button', { name: 'Retomar «Informe nuevo»' }))
    expect(onOpenSaved).toHaveBeenCalledWith(nuevo)

    fireEvent.click(screen.getByRole('button', { name: 'Ver los 2 guardados' }))
    expect(onShowSaved).toHaveBeenCalledTimes(1)

    // Hay una planilla guardada: el camino a Planillas ofrece rellenarla.
    expect(
      screen.getByRole('button', { name: 'Rellenar una planilla' }),
    ).toBeInTheDocument()
  })

  it('con un solo guardado no ofrece «ver los guardados»: retomar ya lo es', () => {
    renderPaths({ saved: [guardado('Único', { savedAt: 3 })] })
    expect(screen.getByRole('button', { name: 'Retomar «Único»' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ver los/ })).not.toBeInTheDocument()
  })

  it('en Planillas ofrece las planillas guardadas, no los PDF ni las secciones', () => {
    const { onShowSaved } = renderPaths({
      mode: 'templates',
      saved: [
        guardado('Informe'),
        guardado('Ingreso', { kind: 'template' }),
        guardado('Alta', { kind: 'template' }),
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Ver tus 2 planillas guardadas' }))
    expect(onShowSaved).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByRole('button', { name: /Retomar|Biblioteca/ }),
    ).not.toBeInTheDocument()
  })

  it('con el panel ya abierto no ofrece abrirlo, y en Planillas calla', () => {
    renderPaths({
      onShowSaved: undefined,
      saved: [guardado('A', { savedAt: 1 }), guardado('B', { savedAt: 2 })],
    })
    expect(screen.getByRole('button', { name: 'Retomar «B»' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ver los/ })).not.toBeInTheDocument()

    const { container } = render(
      <PdfStudioEmptyPaths
        mode="templates"
        saved={[guardado('Ingreso', { kind: 'template' })]}
        onOpenSaved={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
