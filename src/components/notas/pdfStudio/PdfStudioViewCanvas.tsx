import type { ComponentProps, ReactNode } from 'react'
import { PdfStudioOcrPanel } from './ocr/PdfStudioOcrPanel'
import { PdfStudioFormPanel } from './planillas/PdfStudioFormPanel'
import { PdfStudioDocumentControls } from './shell/PdfStudioDocumentControls'
import { PdfStudioMainPane } from './shell/PdfStudioMainPane'
import { Page, PageFill } from '../../Page'

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
      {/* `flex flex-col` en el scroller es lo que hace que el `flex-1` de la
          columna signifique algo: sin él, `align="fill"` no tiene contra qué
          repartir y la columna vuelve a anclarse arriba. */}
      <div
        ref={setScrollRoot}
        className="pdf-studio-canvas flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <Page
          width="workbench"
          align="fill"
          rhythm="block"
          paddingBottom="var(--space-8)"
        >
          <PdfStudioDocumentControls {...documentControlsProps} />
          {templateModeBanner}
          {formPanelProps && <PdfStudioFormPanel {...formPanelProps} />}
          {ocrPanelProps && <PdfStudioOcrPanel {...ocrPanelProps} />}
          {editBar}
          {/* El cromo se queda arriba y SOLO la hoja reparte el alto sobrante:
              centrar la columna entera dejaría la barra de herramientas
              flotando en mitad de la pantalla. */}
          <PageFill center>
            <PdfStudioMainPane {...mainPaneProps} />
          </PageFill>
        </Page>
      </div>
    </div>
  )
}
