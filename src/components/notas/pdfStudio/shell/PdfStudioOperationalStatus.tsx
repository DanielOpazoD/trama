import type { PdfStudioPreflightReport } from '../../../../lib/pdfStudio/preflight/pdfStudioPreflight'
import { summarizePdfStudioPreflight } from '../../../../lib/pdfStudio/preflight/pdfStudioPreflight'
import {
  describePdfStudioAutosaveState,
  type PdfStudioAutosaveState,
} from '../workspace/pdfStudioAutosaveState'

export function PdfStudioOperationalStatus({
  autosaveState,
  preflightReport,
}: {
  autosaveState: PdfStudioAutosaveState
  preflightReport: PdfStudioPreflightReport
}) {
  const autosave = describePdfStudioAutosaveState(autosaveState)
  const primaryIssue =
    preflightReport.blockers[0] ?? preflightReport.warnings[0] ?? preflightReport.info[0]
  const preflightTone = preflightReport.blockers.length
    ? 'alert-error'
    : preflightReport.warnings.length
      ? 'alert-warn'
      : 'border-ink-100 bg-paper-50 text-ink-600'

  return (
    <section
      aria-label="Estado operativo de PDF Studio"
      aria-live="polite"
      className="grid gap-2 rounded-md border border-ink-100 bg-white/85 p-3 text-caption text-ink-700 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]"
    >
      <div>
        <p className="font-semibold text-ink-900">{autosave.label}</p>
        <p className="mt-0.5 text-ink-600">{autosave.detail}</p>
      </div>
      <div className={`rounded-md border px-3 py-2 ${preflightTone}`}>
        <p className="font-semibold">
          Preflight: {summarizePdfStudioPreflight(preflightReport)}
        </p>
        {primaryIssue && (
          <p className="mt-0.5">
            {primaryIssue.severity === 'warning' ? 'Advertencia: ' : ''}
            {primaryIssue.message}
            {primaryIssue.detail ? ` ${primaryIssue.detail}` : ''}
          </p>
        )}
      </div>
    </section>
  )
}
