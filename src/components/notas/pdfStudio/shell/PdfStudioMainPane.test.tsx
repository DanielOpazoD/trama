import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyDoc, type PdfDoc } from '../../../../lib/pdfStudio/model/model'
import type { SavedDoc } from '../../../../lib/pdfStudio/render/persistence'
import { PdfStudioMainPane } from './PdfStudioMainPane'

vi.mock('../pages/PageGrid', () => ({ PageGrid: () => <div>grilla de páginas</div> }))

type Props = Parameters<typeof PdfStudioMainPane>[0]

function pane(over: Partial<Props> = {}) {
  const props: Props = {
    doc: emptyDoc(),
    isTemplates: false,
    scrollRoot: null,
    selectedIds: new Set<string>(),
    onDropFiles: vi.fn(),
    onNudge: vi.fn(),
    onOpenText: vi.fn(),
    onPickFiles: vi.fn(),
    onReorder: vi.fn(),
    onToggleSelect: vi.fn(),
    ...over,
  }
  return render(<PdfStudioMainPane {...props} />)
}

const caminos = (saved: SavedDoc[] = []) => ({
  saved,
  onOpenSaved: vi.fn(),
  onShowSaved: vi.fn(),
  onGoToSection: vi.fn(),
})

describe('<PdfStudioMainPane />', () => {
  it('vacío: la zona de arrastre y, a su lado y no dentro, los caminos', () => {
    pane({ emptyPaths: caminos() })
    const zona = screen.getByRole('button', { name: /Trae un PDF o unas imágenes/ })
    const grupo = screen.getByRole('group', { name: 'Otros caminos a Imprenta' })
    // Un botón dentro de otro es HTML inválido: la zona entera es un <button>.
    expect(zona.contains(grupo)).toBe(false)
    expect(grupo.closest('button')).toBeNull()
  })

  it('en Planillas los caminos siguen el modo de la hoja', () => {
    const planilla: SavedDoc = {
      id: 't',
      name: 'Ingreso',
      doc: emptyDoc(),
      savedAt: 1,
      kind: 'template',
    }
    pane({ isTemplates: true, emptyPaths: caminos([planilla]) })
    expect(
      screen.getByRole('button', { name: 'Ver tu planilla guardada' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: 'Otros caminos a Imprenta' }),
    ).not.toBeInTheDocument()
  })

  it('sin caminos cableados, el vacío sigue siendo solo la zona', () => {
    pane()
    expect(
      screen.getByRole('button', { name: /Trae un PDF o unas imágenes/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('con páginas no hay vacío ni caminos', () => {
    const doc = { ...emptyDoc(), pages: [{ id: 'p1' }] } as unknown as PdfDoc
    pane({ doc, emptyPaths: caminos() })
    expect(screen.getByText('grilla de páginas')).toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})
