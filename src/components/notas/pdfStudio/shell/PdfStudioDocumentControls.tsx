import type { ChangeEvent, ComponentProps, RefObject } from 'react'
import type { PdfDoc } from '../../../../lib/pdfStudio/model/model'
import { PdfTemplateWorkflowGuide } from '../planillas/design/PdfTemplateWorkflowGuide'
import { PdfDocTitleInput } from './PdfDocTitleInput'
import { PdfStudioDocumentToolbar } from './PdfStudioDocumentToolbar'
import { PdfStudioOperationalStatus } from './PdfStudioOperationalStatus'

const ACCEPT = 'application/pdf,image/*'

export function PdfStudioDocumentControls({
  autosaveState,
  doc,
  effectiveTemplateMode,
  empty,
  fileInputRef,
  formSummary,
  onFileInput,
  preflightReport,
  templatesEnabled,
  toolbarProps,
  total,
  updateTitle,
}: {
  autosaveState: ComponentProps<typeof PdfStudioOperationalStatus>['autosaveState']
  doc: PdfDoc
  effectiveTemplateMode: 'design' | 'fill' | null
  empty: boolean
  fileInputRef: RefObject<HTMLInputElement>
  formSummary: string | null
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void
  preflightReport: ComponentProps<typeof PdfStudioOperationalStatus>['preflightReport']
  templatesEnabled: boolean
  toolbarProps: ComponentProps<typeof PdfStudioDocumentToolbar>
  total: number
  updateTitle: (title: string) => void
}) {
  return (
    <>
      {!templatesEnabled && !empty && (
        <PdfDocTitleInput title={doc.title ?? ''} onCommit={updateTitle} />
      )}
      <PdfStudioDocumentToolbar {...toolbarProps} />
      {(!empty || autosaveState.kind !== 'idle') && (
        <PdfStudioOperationalStatus
          autosaveState={autosaveState}
          preflightReport={preflightReport}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={onFileInput}
      />
      {templatesEnabled && effectiveTemplateMode !== 'fill' && (
        <PdfTemplateWorkflowGuide
          fieldCount={doc.formFields?.length ?? 0}
          pageCount={total}
        />
      )}
      {templatesEnabled && formSummary && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-ink-100 bg-paper-50/80 px-3 py-2 text-caption text-ink-600"
        >
          {formSummary}
        </div>
      )}
    </>
  )
}
