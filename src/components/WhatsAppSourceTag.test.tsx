import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WhatsAppSourceTag, isWhatsAppOrigin, isFromWhatsApp } from './WhatsAppSourceTag'

describe('isWhatsAppOrigin / isFromWhatsApp', () => {
  it('detecta origin.importedFrom y source', () => {
    expect(isWhatsAppOrigin({ kind: 'manual', importedFrom: 'whatsapp' })).toBe(true)
    expect(isWhatsAppOrigin({ kind: 'manual' })).toBe(false)
    expect(isWhatsAppOrigin(null)).toBe(false)
    expect(isFromWhatsApp({ source: 'whatsapp' })).toBe(true)
    expect(isFromWhatsApp({ source: 'WhatsApp' })).toBe(true)
    expect(isFromWhatsApp({ source: 'web' })).toBe(false)
  })
})

describe('WhatsAppSourceTag', () => {
  it('renderiza el marcador cuando viene de WhatsApp (origin)', () => {
    render(<WhatsAppSourceTag origin={{ kind: 'manual', importedFrom: 'whatsapp' }} />)
    expect(screen.getByLabelText('Capturado desde WhatsApp')).toBeInTheDocument()
  })

  it('renderiza cuando source=whatsapp', () => {
    render(<WhatsAppSourceTag source="whatsapp" />)
    expect(screen.getByLabelText('Capturado desde WhatsApp')).toBeInTheDocument()
  })

  it('es silencioso (no renderiza) si no viene de WhatsApp', () => {
    const { container } = render(<WhatsAppSourceTag origin={{ kind: 'manual' }} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByLabelText('Capturado desde WhatsApp')).not.toBeInTheDocument()
  })
})
