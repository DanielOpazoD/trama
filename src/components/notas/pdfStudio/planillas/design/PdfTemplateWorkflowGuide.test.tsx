import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PdfTemplateWorkflowGuide } from './PdfTemplateWorkflowGuide'

describe('<PdfTemplateWorkflowGuide />', () => {
  it('guía a subir base cuando no hay documento', () => {
    render(<PdfTemplateWorkflowGuide pageCount={0} fieldCount={0} />)
    expect(screen.getByText(/Sube un PDF o imagen/i)).toBeInTheDocument()
  })

  it('indica el doble clic para crear casilleros cuando hay base sin campos', () => {
    render(<PdfTemplateWorkflowGuide pageCount={2} fieldCount={0} />)
    expect(
      screen.getByText(/Doble clic en una hoja para marcar los casilleros/i),
    ).toBeInTheDocument()
  })

  it('invita a guardar cuando ya hay casilleros, sin repetir botones de la barra', () => {
    render(<PdfTemplateWorkflowGuide pageCount={1} fieldCount={3} />)
    expect(screen.getByText(/3 campos marcados/i)).toBeInTheDocument()
    expect(screen.getByText(/guárdala como plantilla/i)).toBeInTheDocument()
    // La guía ya no duplica acciones (importar/marcar/guardar viven en la barra).
    expect(screen.queryByRole('button')).toBeNull()
  })
})
