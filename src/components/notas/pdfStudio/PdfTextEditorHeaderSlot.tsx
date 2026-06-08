import type { ComponentProps } from 'react'
import { PdfTemplateFillHeader } from './PdfTemplateFillHeader'
import { PdfTextEditorHeader } from './PdfTextEditorHeader'

type EditorHeaderProps = ComponentProps<typeof PdfTextEditorHeader>

export function PdfTextEditorHeaderSlot({
  changeZoom,
  displayZoom,
  fillMode,
  fillProgress,
  headerProps,
  prepareZoomAnchor,
  stepZoomIn,
  stepZoomOut,
  zoomInDisabled,
  zoomOutDisabled,
}: {
  changeZoom: (zoom: number) => void
  displayZoom: number
  fillMode: boolean
  fillProgress: { completed: number; total: number }
  headerProps: EditorHeaderProps
  prepareZoomAnchor: () => void
  stepZoomIn: () => void
  stepZoomOut: () => void
  zoomInDisabled: boolean
  zoomOutDisabled: boolean
}) {
  if (!fillMode) return <PdfTextEditorHeader {...headerProps} />

  return (
    <PdfTemplateFillHeader
      completedFields={fillProgress.completed}
      currentPage={headerProps.currentPage}
      totalFields={fillProgress.total}
      totalPages={headerProps.total}
      zoom={displayZoom}
      zoomInDisabled={zoomInDisabled}
      zoomOutDisabled={zoomOutDisabled}
      onClose={headerProps.onCancel}
      onNextPage={headerProps.onNextPage}
      onPrevPage={headerProps.onPrevPage}
      onPrepareZoomAnchor={prepareZoomAnchor}
      onPrint={headerProps.onPrint ?? (() => undefined)}
      onSaveCopy={headerProps.onSaveCopy}
      onZoomChange={changeZoom}
      onZoomIn={stepZoomIn}
      onZoomOut={stepZoomOut}
    />
  )
}
