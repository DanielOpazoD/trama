import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PdfTemplateFillProfileSection } from './PdfTemplateFillProfileSection'
import {
  loadTemplateProfile,
  profileAsFillValues,
  saveTemplateProfile,
} from './pdfTemplateProfile'

describe('pdfTemplateProfile', () => {
  beforeEach(() => window.localStorage.clear())

  it('persiste y recarga el perfil por usuario, ignorando basura', () => {
    saveTemplateProfile('u1', [{ id: 'a', name: '  RUT ', value: '12.345.678-9' }])
    window.localStorage.setItem('trama:pdf-studio:fill-profile:u2', '"basura"')
    expect(loadTemplateProfile('u1')).toEqual([
      { id: 'a', name: 'RUT', value: '12.345.678-9' },
    ])
    expect(loadTemplateProfile('u2')).toEqual([])
  })

  it('sólo los pares completos se vuelven valores aplicables', () => {
    expect(
      profileAsFillValues([
        { id: 'a', name: 'RUT', value: '1-9' },
        { id: 'b', name: '', value: 'x' },
        { id: 'c', name: 'Teléfono', value: '  ' },
      ]),
    ).toEqual({ RUT: '1-9' })
  })
})

describe('PdfTemplateFillProfileSection', () => {
  beforeEach(() => window.localStorage.clear())

  it('agrega un dato, lo persiste y lo aplica reportando cuántos llenó', () => {
    const onApply = vi.fn(() => 2)
    render(<PdfTemplateFillProfileSection userKey="u1" onApply={onApply} />)

    fireEvent.click(screen.getByRole('button', { name: /Mis datos/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar dato' }))
    // El primer nombre sugerido se precarga
    expect(screen.getByDisplayValue('Nombre profesional')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Valor de Nombre profesional'), {
      target: { value: 'Dra. Prueba' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a esta copia' }))

    expect(onApply).toHaveBeenCalledWith({ 'Nombre profesional': 'Dra. Prueba' })
    expect(screen.getByRole('status').textContent).toContain('2 campos completados')
    expect(loadTemplateProfile('u1')).toEqual([
      expect.objectContaining({ name: 'Nombre profesional', value: 'Dra. Prueba' }),
    ])
  })

  it('sin pares completos el botón de aplicar queda deshabilitado', () => {
    render(<PdfTemplateFillProfileSection userKey="u1" onApply={() => 0} />)
    fireEvent.click(screen.getByRole('button', { name: /Mis datos/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar dato' }))
    expect(screen.getByRole('button', { name: 'Aplicar a esta copia' })).toBeDisabled()
  })
})
