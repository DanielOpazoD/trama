import type { ComponentProps } from 'react'
import { PdfTemplateDesignHeader } from './PdfTemplateDesignHeader'
import { PdfTemplateFillHeader } from './PdfTemplateFillHeader'
import { PdfTextEditorHeader } from './PdfTextEditorHeader'

type EditorHeaderProps = ComponentProps<typeof PdfTextEditorHeader>

export function PdfTextEditorHeaderSlot({
  changeZoom,
  designMode,
  displayZoom,
  fillMode,
  fillProgress,
  headerProps,
  onCreateTemplateField,
  prepareZoomAnchor,
  stepZoomIn,
  stepZoomOut,
  zoomInDisabled,
  zoomOutDisabled,
}: {
  changeZoom: (zoom: number) => void
  designMode: boolean
  displayZoom: number
  fillMode: boolean
  fillProgress: { completed: number; total: number }
  headerProps: EditorHeaderProps
  onCreateTemplateField: () => void
  prepareZoomAnchor: () => void
  stepZoomIn: () => void
  stepZoomOut: () => void
  zoomInDisabled: boolean
  zoomOutDisabled: boolean
}) {
  if (designMode) {
    return (
      <PdfTemplateDesignHeader
        currentPage={headerProps.currentPage}
        fieldCount={fillProgress.total}
        redoable={headerProps.redoable}
        totalPages={headerProps.total}
        undoable={headerProps.undoable}
        zoom={displayZoom}
        zoomInDisabled={zoomInDisabled}
        zoomOutDisabled={zoomOutDisabled}
        onApply={headerProps.onDone}
        onClose={headerProps.onCancel}
        onCreateField={onCreateTemplateField}
        onNextPage={headerProps.onNextPage}
        onPrepareZoomAnchor={prepareZoomAnchor}
        onPrevPage={headerProps.onPrevPage}
        onRedo={headerProps.onRedo}
        onUndo={headerProps.onUndo}
        onZoomChange={changeZoom}
        onZoomIn={stepZoomIn}
        onZoomOut={stepZoomOut}
      />
    )
  }

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
