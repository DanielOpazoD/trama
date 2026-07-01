import type { ComponentProps, ReactNode } from 'react'
import { PdfStudioOcrPanel } from './ocr/PdfStudioOcrPanel'
import { PdfStudioFormPanel } from './planillas/PdfStudioFormPanel'
import { PdfStudioDocumentControls } from './shell/PdfStudioDocumentControls'
import { PdfStudioMainPane } from './shell/PdfStudioMainPane'

export function PdfStudioViewCanvas({
  documentControlsProps,
  editBar,
  formPanelProps,
  mainPaneProps,
  ocrPanelProps,
  setScrollRoot,
  templateModeBanner,
  topBar,
}: {
  documentControlsProps: ComponentProps<typeof PdfStudioDocumentControls>
  editBar: ReactNode
  formPanelProps: ComponentProps<typeof PdfStudioFormPanel> | null
  mainPaneProps: ComponentProps<typeof PdfStudioMainPane>
  ocrPanelProps: ComponentProps<typeof PdfStudioOcrPanel> | null
  setScrollRoot: (element: HTMLElement | null) => void
  templateModeBanner: ReactNode
  topBar: ReactNode
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {topBar}
      <div
        ref={setScrollRoot}
        className="pdf-studio-canvas min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto max-w-5xl space-y-5 px-5 pb-24 pt-6 md:px-8">
          <PdfStudioDocumentControls {...documentControlsProps} />
          {templateModeBanner}
          {formPanelProps && <PdfStudioFormPanel {...formPanelProps} />}
          {ocrPanelProps && <PdfStudioOcrPanel {...ocrPanelProps} />}
          {editBar}
          <PdfStudioMainPane {...mainPaneProps} />
        </div>
      </div>
    </div>
  )
}
