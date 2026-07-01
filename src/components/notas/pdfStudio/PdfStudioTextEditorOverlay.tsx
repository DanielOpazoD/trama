import { Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useModalOverlay } from '../../../hooks/useModalOverlay'
import type { PdfTemplateMode } from './planillas/design/PdfTemplateModeBanner'
import { PdfTextEditor } from './editor/PdfTextEditorLazy'
import type { PdfTextEditorProps } from './editor/PdfTextEditorProps'
import { pdfStudioTextEditorMode } from './PdfStudioViewModel'

type PdfStudioTextEditorOverlayProps = Omit<PdfTextEditorProps, 'mode' | 'pageIndex'> & {
  pageIndex: number | null
  templateMode: PdfTemplateMode | null
}

export function PdfStudioTextEditorOverlay({
  pageIndex,
  templateMode,
  ...props
}: PdfStudioTextEditorOverlayProps) {
  if (pageIndex === null) return null

  return (
    <Suspense fallback={<PdfTextEditorLoadingOverlay />}>
      <PdfTextEditor
        {...props}
        pageIndex={pageIndex}
        mode={pdfStudioTextEditorMode(templateMode)}
      />
    </Suspense>
  )
}

function PdfTextEditorLoadingOverlay() {
  const overlay = useModalOverlay({
    open: true,
    onClose: () => undefined,
    closeOnEscape: false,
  })

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={overlay.dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Cargando editor PDF"
      className="pdf-studio fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm"
    >
      <div className="border border-ink-100 bg-paper-50 px-4 py-3 text-caption font-medium text-ink-700 shadow-xl shadow-ink-900/20">
        Cargando editor PDF...
      </div>
    </div>,
    document.body,
  )
}
