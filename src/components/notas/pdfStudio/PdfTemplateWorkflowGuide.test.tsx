import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PdfTemplateWorkflowGuide } from './PdfTemplateWorkflowGuide'

describe('<PdfTemplateWorkflowGuide />', () => {
  it('muestra el flujo compacto para crear una planilla desde cero', async () => {
    const user = userEvent.setup()
    const onImport = vi.fn()
    render(
      <PdfTemplateWorkflowGuide
        pageCount={0}
        fieldCount={0}
        onAddFields={vi.fn()}
        onDownloadFillable={vi.fn()}
        onImport={onImport}
        onSaveTemplate={vi.fn()}
      />,
    )

    expect(screen.getByRole('region', { name: /Crear plantilla/i })).toBeInTheDocument()
    expect(screen.getByText('Documento')).toBeInTheDocument()
    expect(screen.getByText('Campos de texto')).toBeInTheDocument()
    expect(screen.getByText('Plantilla')).toBeInTheDocument()
    expect(screen.getByText('PDF o imagen')).toBeInTheDocument()
    expect(screen.getByText('Primero sube base')).toBeInTheDocument()
    expect(screen.getByText('Sin campos')).toBeInTheDocument()
    expect(screen.getByText('Documento').closest('[aria-current="step"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Subir PDF\/imagen/i })).toHaveAttribute(
      'data-primary-action',
      'true',
    )
    expect(screen.getByRole('button', { name: /Subir PDF\/imagen/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Marcar espacios/i })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /Subir PDF\/imagen/i }))
    expect(onImport).toHaveBeenCalledTimes(1)
  })

  it('prioriza agregar casilleros cuando ya hay documento base sin campos', async () => {
    const user = userEvent.setup()
    const onAddFields = vi.fn()
    render(
      <PdfTemplateWorkflowGuide
        pageCount={2}
        fieldCount={0}
        onAddFields={onAddFields}
        onDownloadFillable={vi.fn()}
        onImport={vi.fn()}
        onSaveTemplate={vi.fn()}
      />,
    )

    expect(screen.getByText('2 páginas')).toBeInTheDocument()
    expect(
      screen.getByText('Campos de texto').closest('[aria-current="step"]'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /Marcar espacios/i })).toHaveAttribute(
      'data-primary-action',
      'true',
    )
    expect(screen.getByRole('button', { name: /Marcar espacios/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Guardar plantilla/i })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /Marcar espacios/i }))
    expect(onAddFields).toHaveBeenCalledTimes(1)
  })

  it('habilita guardar y descargar rellenable cuando la plantilla tiene casilleros', async () => {
    const user = userEvent.setup()
    const onSaveTemplate = vi.fn()
    const onDownloadFillable = vi.fn()
    render(
      <PdfTemplateWorkflowGuide
        pageCount={1}
        fieldCount={3}
        onAddFields={vi.fn()}
        onDownloadFillable={onDownloadFillable}
        onImport={vi.fn()}
        onSaveTemplate={onSaveTemplate}
      />,
    )

    expect(screen.getByText('3 campos')).toBeInTheDocument()
    expect(screen.getByText('1 página')).toBeInTheDocument()
    expect(screen.getByText('Lista para usar')).toBeInTheDocument()
    expect(screen.getByText('Plantilla').closest('[aria-current="step"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Guardar plantilla/i })).toHaveAttribute(
      'data-primary-action',
      'true',
    )

    await user.click(screen.getByRole('button', { name: /Guardar plantilla/i }))
    await user.click(screen.getByRole('button', { name: /PDF rellenable/i }))

    expect(onSaveTemplate).toHaveBeenCalledTimes(1)
    expect(onDownloadFillable).toHaveBeenCalledTimes(1)
  })
})
