import type { DragEvent } from 'react'
import type { PdfDoc } from '../../../../lib/pdfStudio/model/model'
import { PageGrid } from '../pages/PageGrid'
import { PdfDropzone } from './PdfDropzone'
import type { PageInteractionMode } from './pdfStudioPageInteractionMode'

export function PdfStudioMainPane({
  doc,
  interactionMode = 'editor',
  isTemplates,
  scrollRoot,
  selectedIds,
  onDropFiles,
  onNudge,
  onOpenText,
  onPickFiles,
  onReorder,
  onToggleSelect,
}: {
  doc: PdfDoc
  interactionMode?: PageInteractionMode
  isTemplates: boolean
  scrollRoot: HTMLElement | null
  selectedIds: Set<string>
  onDropFiles: (e: DragEvent) => void
  onNudge: (index: number, delta: -1 | 1) => void
  onOpenText: (index: number) => void
  onPickFiles: () => void
  onReorder: (from: number, to: number) => void
  onToggleSelect: (index: number, shift: boolean) => void
}) {
  if (doc.pages.length === 0) {
    return (
      <PdfDropzone
        onClick={onPickFiles}
        onDropFiles={onDropFiles}
        title={
          isTemplates
            ? 'Crea una planilla desde PDF o imagen'
            : 'Arrastra PDFs o imágenes aquí'
        }
        subtitle={
          isTemplates
            ? 'Agrega casilleros y guárdala para rellenarla después'
            : 'o haz clic para elegir archivos'
        }
      />
    )
  }

  return (
    <PageGrid
      doc={doc}
      interactionMode={interactionMode}
      selectedIds={selectedIds}
      onToggleSelect={onToggleSelect}
      onReorder={onReorder}
      onNudge={onNudge}
      onOpenText={onOpenText}
      onDropFiles={onDropFiles}
      scrollRoot={scrollRoot}
    />
  )
}
